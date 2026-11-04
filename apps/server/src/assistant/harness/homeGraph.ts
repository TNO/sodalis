import neo4j, { type Driver, type Session } from "neo4j-driver";

/**
 * Read-only access to the home knowledge graph imported by the separate
 * `home_simulator` project (readable Neo4j projection). Every query is a fixed,
 * parameterized read; the model never supplies Cypher.
 */

/** Entity kinds (local names of the node's RDF types) that tools may return. */
const ALLOWED_KINDS = [
  "Home", "Building", "Storey", "Level", "Space", "Bedroom", "OutdoorArea",
  "Appliance", "Furniture", "Door", "IndoorDoor", "ExteriorDoor", "Window",
  "OpenableWindow", "Wall", "Device", "Sensor", "TemperatureHumiditySensor",
  "PresenceSensor", "DoorSensor", "MeasurementCapability",
  "ExternalDataReference", "Person", "AssistedResident", "Household",
] as const;

/**
 * Kinds never returned, even when they also carry an allowed kind: personal
 * health and profile records need separate consent, and service, geometry and
 * scenario nodes are internal metadata.
 */
const DENIED_KINDS = [
  "PersonalHealthRecord", "PersonalityProfile", "ProfileGeography", "Interest",
  "Geometry", "DataService", "WalkConnection", "Scenario", "Binding",
  "TargetBinding", "LocationSnapshot",
] as const;

/** Generic kinds that add no information to a result. */
const HIDDEN_KINDS = new Set(["Element", "Opening", "Dataset"]);

export const ENTITY_FILTERS = {
  room: ["Space", "Bedroom", "OutdoorArea"],
  appliance: ["Appliance"],
  furniture: ["Furniture"],
  device: ["Device", "Sensor"],
  opening: ["Door", "Window", "Wall"],
  person: ["Person", "Household"],
  home: ["Home", "Building", "Storey", "Level"],
  data_reference: ["ExternalDataReference"],
  capability: ["MeasurementCapability"],
} as const satisfies Record<string, readonly (typeof ALLOWED_KINDS)[number][]>;
export type EntityFilter = keyof typeof ENTITY_FILTERS;

export const RELATION_GROUPS = {
  location: ["INSTALLED_IN", "LOCATED_IN"],
  structure: ["BOT_HAS_SPACE", "BOT_HAS_STOREY", "BOT_HAS_ELEMENT", "BOT_ADJACENT_ELEMENT", "CONTAINS_OBJECT"],
  measurement: ["MEASURES", "HAS_EXTERNAL_DATA"],
  residents: ["HAS_RESIDENT"],
} as const;
export type RelationGroup = keyof typeof RELATION_GROUPS;
const ALL_RELATIONS = Object.values(RELATION_GROUPS).flat();

export const GRAPH_LIMITS = {
  maxQueryLength: 80,
  maxTerms: 6,
  maxCandidates: 8,
  maxInspectIds: 5,
  maxDepth: 2,
  maxEntities: 40,
  maxRelationships: 60,
  maxReferences: 12,
  queryTimeoutMs: 3_000,
  rowLimit: 400,
} as const;

export interface GraphEntity {
  readonly id: string;
  readonly name: string;
  readonly kinds: readonly string[];
  /** A configured value from the graph; never a current observation. */
  readonly configuredState?: string;
  readonly unit?: string;
  readonly locatedIn?: readonly string[];
}

export interface GraphRelationship {
  readonly from: string;
  readonly type: string;
  readonly to: string;
}

export interface ExternalDataSummary {
  readonly id: string;
  readonly name: string;
  readonly dataKind?: string;
  readonly unit?: string;
  readonly ownerIds: readonly string[];
  /** Whether Sodalis has a configured reader for this reference's source. */
  readonly readable: boolean;
}

export type FindEntitiesResult =
  | { readonly status: "ok" | "ambiguous"; readonly candidates: readonly GraphEntity[]; readonly truncated: boolean }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" };

export type NeighborhoodResult =
  | {
      readonly status: "ok";
      readonly entities: readonly GraphEntity[];
      readonly relationships: readonly GraphRelationship[];
      readonly externalData: readonly ExternalDataSummary[];
      readonly notFound: readonly string[];
      readonly truncated: boolean;
    }
  | { readonly status: "not_found"; readonly notFound: readonly string[] }
  | { readonly status: "unavailable" };

/** Reference metadata resolved on the server; never returned to the model. */
export interface ResolvedReference {
  readonly id: string;
  readonly name: string;
  readonly dataKind?: string;
  readonly resource?: string;
  readonly unit?: string;
  readonly adapter?: string;
  readonly endpoint?: string;
  readonly reporting?: string;
  readonly capabilities: readonly { readonly id: string; readonly unit?: string }[];
}

export type ResolveReferenceResult =
  | { readonly status: "ok"; readonly reference: ResolvedReference }
  | { readonly status: "not_found" }
  | { readonly status: "unavailable" };

export interface HomeGraph {
  findEntities(input: { query: string; kind?: EntityFilter }, signal?: AbortSignal): Promise<FindEntitiesResult>;
  inspectNeighborhood(
    input: { entityIds: readonly string[]; depth?: number; relations?: readonly RelationGroup[] },
    signal?: AbortSignal,
  ): Promise<NeighborhoodResult>;
  resolveReference(referenceId: string, signal?: AbortSignal): Promise<ResolveReferenceResult>;
  close(): Promise<void>;
}

export interface Neo4jHomeGraphOptions {
  readonly url: string;
  readonly user: string;
  readonly password: string;
  readonly database?: string;
  /** The simulator import scope, for example `cphs:simulation:couple-apartment`. */
  readonly scope: string;
  /** Whether a reference's source has a configured reader. */
  readonly isReadable: (adapter: string | undefined, endpoint: string | undefined) => boolean;
  readonly driver?: Driver;
}

const KINDS = (node: string) =>
  `[t IN coalesce(${node}.types, []) | last(split(last(split(t, '/')), '#'))]`;
const ALLOWED = (kinds: string) =>
  `any(k IN ${kinds} WHERE k IN $allowedKinds) AND none(k IN ${kinds} WHERE k IN $deniedKinds)`;

const FIND_QUERY = `
MATCH (n {scope: $scope, demoManaged: true})
WITH n, ${KINDS("n")} AS kinds
WHERE ${ALLOWED("kinds")}
  AND ($filterKinds IS NULL OR any(k IN kinds WHERE k IN $filterKinds))
WITH n, kinds, toLower(coalesce(n.name, '') + ' ' + last(split(n.uri, '/')) + ' ' +
  reduce(s = '', k IN kinds | s + ' ' + k)) AS label
WHERE any(term IN $terms WHERE label CONTAINS term)
WITH n, kinds, label LIMIT $rowLimit
OPTIONAL MATCH (n)-[:INSTALLED_IN|LOCATED_IN]->(place {scope: $scope, demoManaged: true})
RETURN n.uri AS id, n.name AS name, last(split(n.uri, '/')) AS slug, kinds, n.state AS state,
  n.unit AS unit, label, collect(DISTINCT place.name)[0..2] AS locatedIn`;

const NODES_QUERY = `
MATCH (n {scope: $scope, demoManaged: true}) WHERE n.uri IN $ids
WITH n, ${KINDS("n")} AS kinds
WHERE ${ALLOWED("kinds")}
RETURN n.uri AS id, n.name AS name, kinds, n.state AS state, n.unit AS unit`;

const EXPAND_QUERY = `
MATCH (n {scope: $scope, demoManaged: true})-[r]-(m {scope: $scope, demoManaged: true})
WHERE n.uri IN $ids AND type(r) IN $relationTypes
WITH r, m, ${KINDS("m")} AS kinds
WHERE ${ALLOWED("kinds")}
RETURN startNode(r).uri AS from, type(r) AS type, endNode(r).uri AS to,
  m.uri AS id, m.name AS name, kinds, m.state AS state, m.unit AS unit
LIMIT $rowLimit`;

const REFERENCE_SOURCES_QUERY = `
MATCH (r {scope: $scope, demoManaged: true}) WHERE r.uri IN $ids
OPTIONAL MATCH (r)-[:ACCESSIBLE_THROUGH]->(s {scope: $scope, demoManaged: true})
OPTIONAL MATCH (owner {scope: $scope, demoManaged: true})-[:HAS_EXTERNAL_DATA]->(r)
RETURN r.uri AS id, r.dataKind AS dataKind, s.adapter AS adapter, s.endpointURL AS endpoint,
  collect(DISTINCT owner.uri) AS ownerIds`;

const RESOLVE_REFERENCE_QUERY = `
MATCH (owner {scope: $scope, demoManaged: true})-[:HAS_EXTERNAL_DATA]->(r {scope: $scope, demoManaged: true, uri: $id})
WHERE 'ExternalDataReference' IN ${KINDS("r")} AND ${ALLOWED(KINDS("owner"))}
OPTIONAL MATCH (r)-[:ACCESSIBLE_THROUGH]->(s {scope: $scope, demoManaged: true})
OPTIONAL MATCH (owner)-[:MEASURES]->(cap {scope: $scope, demoManaged: true})
RETURN r.uri AS id, r.name AS name, r.dataKind AS dataKind, r.resourceIdentifier AS resource,
  r.unit AS unit, s.adapter AS adapter, s.endpointURL AS endpoint,
  s.requestParameters AS requestParameters,
  collect(DISTINCT {id: cap.uri, unit: cap.unit}) AS capabilities
LIMIT 1`;

/** Connection and server faults that mean "could not check", not a defect. */
const UNAVAILABLE_CODES = new Set([
  "ServiceUnavailable",
  "SessionExpired",
  "Neo.ClientError.Security.Unauthorized",
  "Neo.ClientError.Security.AuthenticationRateLimit",
  "Neo.ClientError.Database.DatabaseNotFound",
]);

function isUnavailable(error: unknown): boolean {
  if (!(error instanceof neo4j.Neo4jError)) return false;
  return (
    UNAVAILABLE_CODES.has(error.code) ||
    error.code.startsWith("Neo.TransientError.") ||
    error.code.startsWith("Neo.ClientError.Transaction.TransactionTimedOut")
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Lower-case word tokens, splitting camel case so `TemperatureHumiditySensor` matches `humidity`. */
function tokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function searchTerms(query: string): string[] {
  return [...new Set(tokens(query).filter((term) => term.length >= 2))].slice(0, GRAPH_LIMITS.maxTerms);
}

function termMatch(term: string, word: string): number {
  if (word === term) return 1;
  if ((term.length >= 4 && word.startsWith(term)) || (word.length >= 4 && term.startsWith(word))) return 1;
  // Dutch compounds, such as `kamer` in `woonkamer`.
  if (term.length >= 4 && word.includes(term)) return 0.5;
  return 0;
}

/**
 * Sum of the best match per query term, plus the share of the entity's own
 * name/slug words that the query covers, so "living room" prefers the room
 * `living` over its door `living-door`.
 */
function matchScore(terms: readonly string[], label: { readonly text: string; readonly ownWords: readonly string[] }): number {
  const words = tokens(label.text);
  const matched = terms.reduce(
    (sum, term) => sum + Math.max(0, ...words.map((word) => termMatch(term, word))),
    0,
  );
  if (!matched || !label.ownWords.length) return matched;
  const covered = label.ownWords.filter((word) => terms.some((term) => termMatch(term, word) > 0)).length;
  return matched + covered / label.ownWords.length;
}

function toEntity(row: Readonly<Record<string, unknown>>): GraphEntity {
  const state = optionalString(row.state);
  const locatedIn = stringList(row.locatedIn);
  const unit = optionalString(row.unit);
  return {
    id: String(row.id),
    name: optionalString(row.name) ?? String(row.id),
    kinds: [...new Set(stringList(row.kinds))].filter((kind) => !HIDDEN_KINDS.has(kind)),
    ...(state && state !== "unknown" ? { configuredState: state } : {}),
    ...(unit ? { unit } : {}),
    ...(locatedIn.length ? { locatedIn } : {}),
  };
}

function parseReporting(requestParameters: unknown): string | undefined {
  if (typeof requestParameters !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(requestParameters);
    if (typeof parsed === "object" && parsed !== null && "reporting" in parsed) {
      return optionalString(parsed.reporting);
    }
  } catch {
    // Malformed metadata only removes the reporting hint.
  }
  return undefined;
}

export class Neo4jHomeGraph implements HomeGraph {
  private readonly driver: Driver;
  private readonly database: string | undefined;
  private readonly scope: string;
  private readonly isReadable: Neo4jHomeGraphOptions["isReadable"];

  constructor(options: Neo4jHomeGraphOptions) {
    this.driver =
      options.driver ??
      neo4j.driver(options.url, neo4j.auth.basic(options.user, options.password), {
        connectionTimeout: GRAPH_LIMITS.queryTimeoutMs,
        connectionAcquisitionTimeout: GRAPH_LIMITS.queryTimeoutMs,
        maxTransactionRetryTime: 1_000,
        maxConnectionPoolSize: 8,
        disableLosslessIntegers: true,
      });
    this.database = options.database;
    this.scope = options.scope;
    this.isReadable = options.isReadable;
  }

  async findEntities(
    input: { query: string; kind?: EntityFilter },
    signal?: AbortSignal,
  ): Promise<FindEntitiesResult> {
    const terms = searchTerms(input.query.slice(0, GRAPH_LIMITS.maxQueryLength));
    if (!terms.length) return { status: "not_found" };
    const rows = await this.read(signal, async (session) => {
      const result = await session.executeRead(
        (tx) =>
          tx.run(FIND_QUERY, {
            ...this.baseParameters(),
            terms,
            filterKinds: input.kind ? [...ENTITY_FILTERS[input.kind]] : null,
          }),
        { timeout: GRAPH_LIMITS.queryTimeoutMs },
      );
      return result.records.map((record) => record.toObject());
    });
    if (rows === "unavailable") return { status: "unavailable" };
    const scored = rows
      .map((row) => ({
        entity: toEntity(row),
        score: matchScore(terms, {
          text: String(row.label ?? ""),
          ownWords: [...new Set(tokens(`${String(row.name ?? "")} ${String(row.slug ?? "")}`))],
        }),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
    if (!scored.length) return { status: "not_found" };
    const top = scored[0]!.score;
    const candidates = scored.slice(0, GRAPH_LIMITS.maxCandidates).map((candidate) => candidate.entity);
    return {
      status: scored.filter((candidate) => candidate.score === top).length > 1 ? "ambiguous" : "ok",
      candidates,
      truncated: scored.length > candidates.length || rows.length >= GRAPH_LIMITS.rowLimit,
    };
  }

  async inspectNeighborhood(
    input: { entityIds: readonly string[]; depth?: number; relations?: readonly RelationGroup[] },
    signal?: AbortSignal,
  ): Promise<NeighborhoodResult> {
    const ids = [...new Set(input.entityIds)].slice(0, GRAPH_LIMITS.maxInspectIds);
    const depth = Math.min(Math.max(Math.trunc(input.depth ?? 1), 1), GRAPH_LIMITS.maxDepth);
    const relationTypes = input.relations?.length
      ? [...new Set(input.relations.flatMap((group) => RELATION_GROUPS[group]))]
      : ALL_RELATIONS;
    const outcome = await this.read(signal, (session) =>
      session.executeRead(
        async (tx) => {
          const params = this.baseParameters();
          const starts = (await tx.run(NODES_QUERY, { ...params, ids })).records.map((record) =>
            toEntity(record.toObject()),
          );
          const entities = new Map(starts.map((entity) => [entity.id, entity]));
          const relationships = new Map<string, GraphRelationship>();
          let truncated = false;
          let frontier = starts.map((entity) => entity.id);
          for (let level = 0; level < depth && frontier.length; level += 1) {
            const records = (
              await tx.run(EXPAND_QUERY, { ...params, ids: frontier, relationTypes })
            ).records;
            if (records.length >= GRAPH_LIMITS.rowLimit) truncated = true;
            const next: string[] = [];
            for (const record of records) {
              const row = record.toObject();
              const entity = toEntity(row);
              if (!entities.has(entity.id)) {
                if (entities.size >= GRAPH_LIMITS.maxEntities) {
                  truncated = true;
                  continue;
                }
                entities.set(entity.id, entity);
                next.push(entity.id);
              }
              const relationship = { from: String(row.from), type: String(row.type), to: String(row.to) };
              const key = `${relationship.from}|${relationship.type}|${relationship.to}`;
              if (relationships.has(key)) continue;
              if (relationships.size >= GRAPH_LIMITS.maxRelationships) {
                truncated = true;
                continue;
              }
              relationships.set(key, relationship);
            }
            frontier = next.filter((id) => !entities.get(id)?.kinds.includes("ExternalDataReference"));
          }
          const referenceIds = [...entities.values()]
            .filter((entity) => entity.kinds.includes("ExternalDataReference"))
            .map((entity) => entity.id);
          if (referenceIds.length > GRAPH_LIMITS.maxReferences) truncated = true;
          const sources = referenceIds.length
            ? (
                await tx.run(REFERENCE_SOURCES_QUERY, {
                  ...params,
                  ids: referenceIds.slice(0, GRAPH_LIMITS.maxReferences),
                })
              ).records.map((record) => record.toObject())
            : [];
          return { starts, entities, relationships, sources, truncated };
        },
        { timeout: GRAPH_LIMITS.queryTimeoutMs },
      ),
    );
    if (outcome === "unavailable") return { status: "unavailable" };
    const found = new Set(outcome.starts.map((entity) => entity.id));
    const notFound = ids.filter((id) => !found.has(id));
    if (!outcome.starts.length) return { status: "not_found", notFound };
    const sourceById = new Map(outcome.sources.map((source) => [String(source.id), source]));
    const externalData: ExternalDataSummary[] = [];
    const entities: GraphEntity[] = [];
    for (const entity of outcome.entities.values()) {
      const source = sourceById.get(entity.id);
      if (!entity.kinds.includes("ExternalDataReference")) {
        entities.push(entity);
      } else if (source) {
        const dataKind = optionalString(source.dataKind);
        externalData.push({
          id: entity.id,
          name: entity.name,
          ...(dataKind ? { dataKind } : {}),
          ...(entity.unit ? { unit: entity.unit } : {}),
          ownerIds: stringList(source.ownerIds).filter((id) => outcome.entities.has(id)),
          readable: this.isReadable(optionalString(source.adapter), optionalString(source.endpoint)),
        });
      }
    }
    return {
      status: "ok",
      entities,
      relationships: [...outcome.relationships.values()].filter(
        (relationship) => relationship.type !== "HAS_EXTERNAL_DATA",
      ),
      externalData,
      notFound,
      truncated: outcome.truncated,
    };
  }

  async resolveReference(referenceId: string, signal?: AbortSignal): Promise<ResolveReferenceResult> {
    const row = await this.read(signal, async (session) => {
      const result = await session.executeRead(
        (tx) => tx.run(RESOLVE_REFERENCE_QUERY, { ...this.baseParameters(), id: referenceId }),
        { timeout: GRAPH_LIMITS.queryTimeoutMs },
      );
      return result.records[0]?.toObject();
    });
    if (row === "unavailable") return { status: "unavailable" };
    if (!row) return { status: "not_found" };
    const capabilities = (Array.isArray(row.capabilities) ? row.capabilities : [])
      .filter(
        (capability): capability is { id: string; unit?: unknown } =>
          typeof capability === "object" && capability !== null && typeof capability.id === "string",
      )
      .map((capability) => {
        const unit = optionalString(capability.unit);
        return { id: capability.id, ...(unit ? { unit } : {}) };
      });
    const fields = {
      dataKind: optionalString(row.dataKind),
      resource: optionalString(row.resource),
      unit: optionalString(row.unit),
      adapter: optionalString(row.adapter),
      endpoint: optionalString(row.endpoint),
      reporting: parseReporting(row.requestParameters),
    };
    return {
      status: "ok",
      reference: {
        id: String(row.id),
        name: optionalString(row.name) ?? String(row.id),
        ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
        capabilities,
      },
    };
  }

  close(): Promise<void> {
    return this.driver.close();
  }

  /**
   * Verifies connectivity and compiles every query plan once, so the first
   * resident question does not pay Neo4j's cold planning cost (seconds).
   */
  async warmUp(): Promise<void> {
    await this.driver.verifyConnectivity(this.database ? { database: this.database } : {});
    const session = this.driver.session({
      defaultAccessMode: neo4j.session.READ,
      ...(this.database ? { database: this.database } : {}),
    });
    try {
      await session.executeRead(async (tx) => {
        const params = this.baseParameters();
        await tx.run(FIND_QUERY, { ...params, terms: ["warm-up"], filterKinds: null });
        await tx.run(FIND_QUERY, { ...params, terms: ["warm-up"], filterKinds: ["Space"] });
        await tx.run(NODES_QUERY, { ...params, ids: [] });
        await tx.run(EXPAND_QUERY, { ...params, ids: [], relationTypes: ALL_RELATIONS });
        await tx.run(REFERENCE_SOURCES_QUERY, { ...params, ids: [] });
        await tx.run(RESOLVE_REFERENCE_QUERY, { ...params, id: "" });
      });
    } finally {
      await session.close();
    }
  }

  private baseParameters() {
    return {
      scope: this.scope,
      allowedKinds: [...ALLOWED_KINDS],
      deniedKinds: [...DENIED_KINDS],
      rowLimit: neo4j.int(GRAPH_LIMITS.rowLimit),
    };
  }

  /** Runs `work` in a read-mode session that is closed on abort. */
  private async read<T>(
    signal: AbortSignal | undefined,
    work: (session: Session) => Promise<T>,
  ): Promise<T | "unavailable"> {
    signal?.throwIfAborted();
    const session = this.driver.session({
      defaultAccessMode: neo4j.session.READ,
      ...(this.database ? { database: this.database } : {}),
    });
    const onAbort = () => void session.close();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await work(session);
    } catch (error) {
      signal?.throwIfAborted();
      if (isUnavailable(error)) {
        console.error("Home graph read is unavailable:", error);
        return "unavailable";
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      await session.close();
    }
  }
}
