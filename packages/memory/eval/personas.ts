import { Random } from "./random.js";

/** A persona from `nvidia/Nemotron-Personas-Belgium` (CC-BY-4.0, NVIDIA). */
export interface Persona {
  readonly id: string;
  readonly firstName: string;
  readonly sex: "Man" | "Vrouw";
  readonly age: number;
  readonly municipality: string;
  readonly maritalStatus: string;
  readonly hobbies: readonly string[];
  readonly summary: string;
}

export const PERSONA_DATASET = "nvidia/Nemotron-Personas-Belgium";
export const PERSONA_ATTRIBUTION =
  "Personas from nvidia/Nemotron-Personas-Belgium (NVIDIA, CC-BY-4.0), https://huggingface.co/datasets/nvidia/Nemotron-Personas-Belgium";
const TOTAL_ROWS = 300_000;
const PAGE = 100;

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Converts a dataset row; undefined when required fields are missing. */
export function personaFromRow(row: Record<string, unknown>): Persona | undefined {
  const age = Number(row.age);
  const summary = typeof row.persona === "string" ? row.persona : "";
  const firstName = summary.split(/\s+/)[0]?.replace(/[^\p{L}-]/gu, "") ?? "";
  if (!Number.isFinite(age) || !firstName || (row.sex !== "Man" && row.sex !== "Vrouw")) return undefined;
  return {
    id: String(row.uuid),
    firstName,
    sex: row.sex,
    age,
    municipality: String(row.municipality ?? ""),
    maritalStatus: String(row.marital_status ?? ""),
    hobbies: parseList(row.hobbies_and_interests_list),
    summary,
  };
}

/**
 * Samples elderly `nl_BE` personas by reading pages at seeded offsets (the
 * datasets-server filter endpoint times out on this dataset).
 */
export async function fetchPersonas(options: {
  count: number;
  minAge?: number;
  seed?: number;
  fetch?: typeof fetch;
}): Promise<Persona[]> {
  const fetcher = options.fetch ?? fetch;
  const random = new Random(options.seed ?? 1);
  const minAge = options.minAge ?? 70;
  const personas: Persona[] = [];
  for (let attempt = 0; personas.length < options.count && attempt < 50; attempt += 1) {
    const offset = random.int(0, TOTAL_ROWS / PAGE - 1) * PAGE;
    const url =
      "https://datasets-server.huggingface.co/rows?dataset=" +
      encodeURIComponent(PERSONA_DATASET) +
      `&config=default&split=nl_BE&offset=${offset}&length=${PAGE}`;
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Persona download failed: HTTP ${response.status}`);
    const body = (await response.json()) as { rows?: { row: Record<string, unknown> }[] };
    for (const { row } of body.rows ?? []) {
      const persona = personaFromRow(row);
      if (persona && persona.age >= minAge && personas.length < options.count) personas.push(persona);
    }
  }
  return personas;
}

/** Hand-written personas for tests and offline runs (not from the dataset). */
export const FIXTURE_PERSONAS: readonly Persona[] = [
  {
    id: "fixture-1",
    firstName: "Maria",
    sex: "Vrouw",
    age: 78,
    municipality: "Lier",
    maritalStatus: "Weduwe",
    hobbies: ["tuinieren", "kaarten"],
    summary: "Maria is een gepensioneerde onderwijzeres uit Lier.",
  },
  {
    id: "fixture-2",
    firstName: "Jozef",
    sex: "Man",
    age: 82,
    municipality: "Tienen",
    maritalStatus: "Gehuwd",
    hobbies: ["fietsen", "duiven melken"],
    summary: "Jozef is een gepensioneerde bakker uit Tienen.",
  },
];
