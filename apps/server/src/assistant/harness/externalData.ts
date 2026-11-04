import { DatabaseSync } from "node:sqlite";
import type { ResolvedReference } from "./homeGraph.js";

/**
 * Source-specific retrieval for external-data references. Only the simulator's
 * SQLite readings series are supported. The graph names an endpoint; Sodalis
 * maps that endpoint to a configured file and never opens a path taken from
 * graph metadata or model input.
 */

export const EXTERNAL_DATA_LIMITS = {
  maxRangeMs: 48 * 60 * 60 * 1000,
  maxSamples: 12,
  maxRowsScanned: 20_000,
  /** A periodic measurement older than this is reported as stale. */
  periodicStaleAfterMs: 15 * 60 * 1000,
} as const;

export interface TimeRange {
  readonly start: string;
  readonly end: string;
}

export interface Observation {
  readonly value: number;
  readonly observedAt: string;
  readonly event?: string;
}

export type ExternalReadResult =
  | {
      readonly status: "ok";
      readonly referenceId: string;
      readonly name: string;
      readonly unit?: string;
      readonly reporting?: string;
      readonly latest: Observation;
      /**
       * `current`: recent periodic measurement; `stale`: periodic measurement
       * older than expected; `last_change`: latest event of a state-change
       * series, whose state persists until the next change.
       */
      readonly freshness: "current" | "stale" | "last_change";
      readonly ageMinutes: number;
      readonly range?: {
        readonly start: string;
        readonly end: string;
        readonly count: number;
        readonly min: number;
        readonly max: number;
        readonly mean: number;
        readonly samples: readonly Observation[];
        readonly truncated: boolean;
      };
    }
  | { readonly status: "no_data"; readonly referenceId: string; readonly name: string }
  | { readonly status: "unavailable"; readonly referenceId: string; readonly reason: "unsupported_source" | "source_unreachable" };

export interface ExternalDataReader {
  /** Whether a reference with this service metadata can be read. */
  isReadable(adapter: string | undefined, endpoint: string | undefined): boolean;
  read(reference: ResolvedReference, range: TimeRange | undefined, signal?: AbortSignal): Promise<ExternalReadResult>;
}

/** Parses a timezone-qualified ISO timestamp; returns undefined otherwise. */
function parseZonedTime(value: string): number | undefined {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

export type RangeCheck = { readonly ok: true; readonly startMs: number; readonly endMs: number } | { readonly ok: false; readonly reason: string };

export function checkRange(range: TimeRange): RangeCheck {
  const startMs = parseZonedTime(range.start);
  const endMs = parseZonedTime(range.end);
  if (startMs === undefined || endMs === undefined) {
    return { ok: false, reason: "start and end must be ISO 8601 timestamps with a time zone" };
  }
  if (startMs >= endMs) return { ok: false, reason: "start must be before end" };
  if (endMs - startMs > EXTERNAL_DATA_LIMITS.maxRangeMs) {
    return { ok: false, reason: "the range may span at most 48 hours" };
  }
  return { ok: true, startMs, endMs };
}

export interface SqliteReadingsReaderOptions {
  /** Graph endpoint served by `file`, for example `local://simulation/timeseries.sqlite`. */
  readonly endpoint: string;
  readonly file: string;
  readonly now?: () => number;
}

interface ReadingRow {
  readonly timestamp: string;
  readonly value: number;
  readonly property: string | null;
  readonly event_type: string | null;
}

function toObservation(row: ReadingRow): Observation {
  return {
    value: row.value,
    observedAt: row.timestamp,
    ...(row.event_type && row.event_type !== "measurement" ? { event: row.event_type } : {}),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reads the simulator's `readings(series, timestamp, value, property, event_type)` table. */
export class SqliteReadingsReader implements ExternalDataReader {
  private readonly endpoint: string;
  private readonly file: string;
  private readonly now: () => number;

  constructor(options: SqliteReadingsReaderOptions) {
    this.endpoint = options.endpoint;
    this.file = options.file;
    this.now = options.now ?? Date.now;
  }

  isReadable(adapter: string | undefined, endpoint: string | undefined): boolean {
    return adapter === "sqlite" && endpoint === this.endpoint;
  }

  async read(reference: ResolvedReference, range: TimeRange | undefined, signal?: AbortSignal): Promise<ExternalReadResult> {
    signal?.throwIfAborted();
    if (!this.isReadable(reference.adapter, reference.endpoint) || !reference.resource) {
      return { status: "unavailable", referenceId: reference.id, reason: "unsupported_source" };
    }
    const checked = range ? checkRange(range) : undefined;
    if (checked && !checked.ok) throw new RangeError(checked.reason);
    let rows: ReadingRow[];
    try {
      const database = new DatabaseSync(this.file, { readOnly: true });
      try {
        const latest = database
          .prepare("SELECT timestamp, value, property, event_type FROM readings WHERE series = ? ORDER BY timestamp DESC LIMIT 1")
          .get(reference.resource) as ReadingRow | undefined;
        rows = latest ? [latest] : [];
        if (checked?.ok && latest) {
          // A day of padding keeps rows whose UTC offset differs from the bounds;
          // exact filtering by instant happens below.
          const day = 24 * 60 * 60 * 1000;
          const ranged = database
            .prepare(
              "SELECT timestamp, value, property, event_type FROM readings WHERE series = ? AND timestamp >= ? AND timestamp < ? ORDER BY timestamp LIMIT ?",
            )
            .all(
              reference.resource,
              new Date(checked.startMs - day).toISOString().slice(0, 10),
              new Date(checked.endMs + day).toISOString().slice(0, 10),
              EXTERNAL_DATA_LIMITS.maxRowsScanned,
            ) as unknown as ReadingRow[];
          rows = [latest, ...ranged];
        }
      } finally {
        database.close();
      }
    } catch (error) {
      console.error(`External data source for "${reference.id}" is unavailable:`, error);
      return { status: "unavailable", referenceId: reference.id, reason: "source_unreachable" };
    }
    const latest = rows[0];
    if (!latest || typeof latest.value !== "number") {
      return { status: "no_data", referenceId: reference.id, name: reference.name };
    }
    const latestMs = parseZonedTime(latest.timestamp) ?? Date.parse(latest.timestamp);
    const ageMs = Math.max(0, this.now() - latestMs);
    const freshness =
      reference.reporting === "state_changes"
        ? "last_change"
        : ageMs > EXTERNAL_DATA_LIMITS.periodicStaleAfterMs
          ? "stale"
          : "current";
    const unit = reference.unit ?? this.capabilityUnit(reference, latest.property);
    let rangeResult: Extract<ExternalReadResult, { status: "ok" }>["range"];
    if (checked?.ok) {
      const inRange = rows.slice(1).filter((row) => {
        const time = parseZonedTime(row.timestamp);
        return time !== undefined && time >= checked.startMs && time < checked.endMs && typeof row.value === "number";
      });
      const values = inRange.map((row) => row.value);
      const step = Math.max(1, Math.ceil(inRange.length / EXTERNAL_DATA_LIMITS.maxSamples));
      const samples = inRange.filter((_, index) => index % step === 0).slice(0, EXTERNAL_DATA_LIMITS.maxSamples);
      rangeResult = {
        start: range!.start,
        end: range!.end,
        count: inRange.length,
        min: values.length ? round(Math.min(...values)) : 0,
        max: values.length ? round(Math.max(...values)) : 0,
        mean: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0,
        samples: samples.map(toObservation),
        truncated: samples.length < inRange.length || rows.length - 1 >= EXTERNAL_DATA_LIMITS.maxRowsScanned,
      };
    }
    return {
      status: "ok",
      referenceId: reference.id,
      name: reference.name,
      ...(unit ? { unit } : {}),
      ...(reference.reporting ? { reporting: reference.reporting } : {}),
      latest: toObservation(latest),
      freshness,
      ageMinutes: Math.round(ageMs / 60_000),
      ...(rangeResult ? { range: rangeResult } : {}),
    };
  }

  /** The unit of the owner's capability for this reading property (`.../measurement/Temperature`). */
  private capabilityUnit(reference: ResolvedReference, property: string | null): string | undefined {
    if (!property) return undefined;
    return reference.capabilities.find((capability) => capability.id.endsWith(`/${property}`))?.unit;
  }
}
