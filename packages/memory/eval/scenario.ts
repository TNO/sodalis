import type { EvalQuestion, ExpectedItem, PlantedEvent } from "./cases.js";
import type { Persona } from "./personas.js";
import { Random, seedFrom } from "./random.js";

/** The ground truth for one persona: planted events per session and QA. */
export interface Scenario {
  readonly id: string;
  readonly persona: Persona;
  readonly seed: number;
  readonly sessions: readonly { readonly id: string; readonly date: string; readonly events: readonly string[] }[];
  readonly events: Readonly<Record<string, PlantedEvent>>;
  readonly questions: readonly EvalQuestion[];
}

export interface ScenarioOptions {
  readonly sessions?: number;
  readonly start?: string;
}

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const NAMES = ["Anna", "Lotte", "Marie", "Sofie", "Elke", "Lien", "Jan", "Pieter", "Wout", "Tom", "Bart", "Lucas", "Emma", "Noor", "Jef", "Mila", "Ruben", "Hanne"];
const CITIES = ["Gent", "Leuven", "Brugge", "Antwerpen", "Hasselt", "Mechelen", "Aalst", "Kortrijk"];
const PETS = [
  { animal: "hond", names: ["Bello", "Max", "Rex", "Luna"] },
  { animal: "kat", names: ["Minou", "Felix", "Poes", "Tijger"] },
];
const PREFERENCES = [
  { topic: "drinken", question: "Wat drink ik het liefst?", before: "koffie", after: "thee",
    sayBefore: (v: string) => `Ik drink het liefst ${v}, elke ochtend.`,
    sayAfter: (old: string, v: string) => `Ik drink tegenwoordig geen ${old} meer, ik ben overgestapt op ${v}.` },
  { topic: "eten", question: "Wat is mijn lievelingseten?", before: "stoofvlees", after: "waterzooi",
    sayBefore: (v: string) => `Mijn lievelingseten is ${v} met frietjes.`,
    sayAfter: (old: string, v: string) => `Ik eet niet meer zo graag ${old}, ${v} is nu mijn lievelingseten.` },
  { topic: "muziek", question: "Naar welke muziek luister ik het liefst?", before: "Will Tura", after: "Bart Peeters",
    sayBefore: (v: string) => `Ik luister het liefst naar ${v}.`,
    sayAfter: (old: string, v: string) => `Ik luister niet meer zoveel naar ${old}, nu vooral naar ${v}.` },
];
const PLACES = [
  { name: "tandarts", noun: "de tandarts" },
  { name: "huisarts", noun: "de huisarts" },
  { name: "kapper", noun: "de kapper" },
  { name: "oogarts", noun: "de oogarts" },
];
const MEDICATION = [
  { name: "bloeddrukpil", say: "Ik neem elke ochtend een bloeddrukpil.", question: "Welke pil neem ik elke ochtend?" },
  { name: "cholesterolremmer", say: "Ik moet elke avond een cholesterolremmer nemen.", question: "Welke medicatie neem ik 's avonds?" },
];
const TRANSIENT = [
  "Ik ben vandaag een beetje moe.",
  "Ik heb vandaag last van mijn rug.",
  "Ik voel me vandaag wat somber.",
];
const DISTRACTORS = [
  "Wat een weer vandaag, hè.",
  "Ik heb net de krant gelezen.",
  "Hoe laat is het eigenlijk?",
  "Vertel eens een mopje.",
  "Het is rustig op straat vandaag.",
];

export function dutchDate(iso: string, withWeekday = false): string {
  const date = new Date(iso);
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS[date.getUTCDay()]} ${day}` : day;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

/**
 * Builds a seeded event graph for a persona: family, a pet, a hobby,
 * preferences that change, a correction, a restatement, appointments and a
 * birthday, a health fact, transient states, a routine, and distractors.
 * Every label and question answer comes from this graph.
 */
export function generateScenario(persona: Persona, seed: number, options: ScenarioOptions = {}): Scenario {
  const random = new Random(seed ^ seedFrom(persona.id));
  const sessionCount = Math.max(4, options.sessions ?? 6);
  const dates: string[] = [];
  let date = options.start ?? "2026-01-05T10:00:00.000Z";
  for (let index = 0; index < sessionCount; index += 1) {
    dates.push(date);
    date = addDays(date, random.int(1, 4));
  }
  const askedAt = addDays(dates.at(-1)!, 1);
  const events: Record<string, PlantedEvent> = {};
  const placed: string[][] = dates.map(() => []);
  const questions: EvalQuestion[] = [];
  let counter = 0;
  const plant = (session: number, event: Omit<PlantedEvent, "id">): PlantedEvent => {
    const planted = { id: `e${++counter}`, ...event };
    events[planted.id] = planted;
    placed[Math.min(session, sessionCount - 1)]!.push(planted.id);
    return planted;
  };
  const ask = (type: string, question: string, answer: string, keywords: string[], extra: Partial<EvalQuestion> = {}) => {
    questions.push({ id: `q${questions.length + 1}`, type, question, answer, keywords, askedAt, ...extra });
  };
  const fact = (subject: string, keywords: string[], overrides: Partial<ExpectedItem> = {}): ExpectedItem => ({
    layer: "L4",
    subject,
    keywords,
    sensitivity: "general",
    transient: false,
    ...overrides,
  });

  const [childName, grandchildName, wrongName, friendName] = random.sample(NAMES, 4) as [string, string, string, string];
  const child = random.pick(["dochter", "zoon"]);
  const city = random.pick(CITIES);
  plant(0, {
    kind: "family",
    say: `Mijn ${child} ${childName} woont in ${city}.`,
    worthy: true,
    expected: fact(childName, [childName, city]),
    actions: ["ADD"],
  });
  ask("single-session", `In welke stad woont mijn ${child}?`, city, [city]);

  const grandchild = random.pick(["kleindochter", "kleinzoon"]);
  const wrong = plant(0, {
    kind: "family",
    say: `Mijn ${grandchild} heet ${wrongName}.`,
    worthy: true,
    expected: fact(wrongName, [wrongName]),
    actions: ["ADD"],
  });
  plant(2, {
    kind: "correction",
    say: `Oei, ik vergiste me vorige keer: mijn ${grandchild} heet niet ${wrongName} maar ${grandchildName}.`,
    worthy: true,
    expected: fact(grandchildName, [grandchildName]),
    actions: ["UPDATE", "SUPERSEDE"],
    target: wrong.id,
  });
  ask("knowledge-update", `Hoe heet mijn ${grandchild}?`, grandchildName, [grandchildName]);

  const pet = random.pick(PETS);
  const petName = random.pick(pet.names);
  const petEvent = plant(1, {
    kind: "pet",
    say: `Ik heb een ${pet.animal} die ${petName} heet.`,
    worthy: true,
    expected: fact(petName, [petName]),
    actions: ["ADD"],
  });
  ask("single-session", `Hoe heet mijn ${pet.animal}?`, petName, [petName]);
  plant(3, {
    kind: "restatement",
    say: `${petName} is mijn ${pet.animal}, weet je nog?`,
    worthy: true,
    expected: fact(petName, [petName]),
    actions: ["NOOP", "UPDATE"],
    target: petEvent.id,
  });

  const hobby = persona.hobbies[0]?.toLowerCase() ?? random.pick(["tuinieren", "wandelen", "kaarten"]);
  plant(1, {
    kind: "hobby",
    say: `Mijn grootste hobby is ${hobby}.`,
    worthy: true,
    expected: fact("user", hobby.split(/\s+/).filter((word) => word.length > 3).slice(0, 2)),
    actions: ["ADD"],
  });

  const preference = random.pick(PREFERENCES);
  const before = plant(0, {
    kind: "preference",
    say: preference.sayBefore(preference.before),
    worthy: true,
    expected: fact("user", [preference.before]),
    actions: ["ADD"],
  });
  plant(sessionCount - 2, {
    kind: "preference-change",
    say: preference.sayAfter(preference.before, preference.after),
    worthy: true,
    expected: fact("user", [preference.after]),
    actions: ["SUPERSEDE", "UPDATE"],
    target: before.id,
  });
  ask("knowledge-update", preference.question, preference.after, [preference.after]);

  const place = random.pick(PLACES);
  const appointmentSession = random.int(1, sessionCount - 2);
  const appointmentAt = addDays(dates[sessionCount - 1]!, random.int(3, 12)).slice(0, 10);
  const hour = random.int(9, 16);
  plant(appointmentSession, {
    kind: "appointment",
    say: `Ik heb op ${dutchDate(`${appointmentAt}T00:00:00Z`, true)} om ${hour} uur een afspraak bij ${place.noun}.`,
    worthy: true,
    expected: fact(place.name, [place.name], { layer: "L2", eventAt: appointmentAt }),
    actions: ["ADD"],
  });
  ask("temporal", `Wanneer heb ik een afspraak bij ${place.noun}?`, dutchDate(`${appointmentAt}T00:00:00Z`), dutchDate(`${appointmentAt}T00:00:00Z`).split(" "));

  const birthday = `2026-${String(random.int(1, 12)).padStart(2, "0")}-${String(random.int(1, 28)).padStart(2, "0")}`;
  plant(random.int(0, sessionCount - 1), {
    kind: "birthday",
    say: `Mijn vriend${friendName.match(/[ae]$/) ? "in" : ""} ${friendName} is jarig op ${dutchDate(`${birthday}T00:00:00Z`)}.`,
    worthy: true,
    expected: fact(friendName, dutchDate(`${birthday}T00:00:00Z`).split(" "), { layer: "L2" }),
    actions: ["ADD"],
  });
  ask("temporal", `Wanneer is ${friendName} jarig?`, dutchDate(`${birthday}T00:00:00Z`), dutchDate(`${birthday}T00:00:00Z`).split(" "));

  const medication = random.pick(MEDICATION);
  plant(random.int(1, sessionCount - 1), {
    kind: "health",
    say: medication.say,
    worthy: true,
    expected: fact("user", [medication.name], { layer: "L2", sensitivity: "health" }),
    actions: ["ADD"],
  });
  ask("health", medication.question, medication.name, [medication.name]);

  for (const session of random.sample([...dates.keys()], 2)) {
    const text = random.pick(TRANSIENT);
    plant(session, {
      kind: "transient",
      say: text,
      worthy: true,
      expected: fact("user", [text.split(" ").slice(-1)[0]!.replace(/\W/g, "")], { layer: "L3", transient: true }),
    });
  }

  for (const session of random.sample([...dates.keys()], 3).sort()) {
    plant(session, {
      kind: "routine",
      say: `Vanochtend ben ik weer gaan wandelen in het park met ${petName}.`,
      worthy: true,
      expected: fact("user", ["wandelen", "park"], { layer: "L2" }),
    });
  }
  ask("routine", "Wat doe ik vaak 's ochtends?", `wandelen in het park met ${petName}`, ["wandelen"]);

  for (const session of dates.keys()) {
    for (const text of random.sample(DISTRACTORS, random.int(1, 2))) {
      plant(session, { kind: "distractor", say: text, worthy: false });
    }
  }
  const absentRelative = random.pick(["broer", "zus", "neef"]);
  ask("abstention", `Hoe heet mijn ${absentRelative}?`, "Onbekend: nooit verteld.", [], { abstain: true });

  return {
    id: `${persona.id}:${seed}`,
    persona,
    seed,
    sessions: dates.map((sessionDate, index) => ({
      id: `s${index + 1}`,
      date: sessionDate,
      events: random.shuffle(placed[index]!),
    })),
    events,
    questions,
  };
}
