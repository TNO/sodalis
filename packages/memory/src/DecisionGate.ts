import type { ChatClient } from "./ChatClient.js";

/**
 * A System One-style question (`/v1/systemone`): a `noul` asks a yes/no
 * question and returns a probability; a `choice` returns one option plus a
 * probability per option.
 */
export type SystemOneQuestion =
  | { readonly key: string; readonly type: "noul"; readonly question: string }
  | { readonly key: string; readonly type: "choice"; readonly question: string; readonly choices: readonly string[] };

export interface SystemOneRequest {
  readonly state: string;
  readonly questions: readonly SystemOneQuestion[];
}

export type SystemOneAnswer =
  | { readonly key: string; readonly type: "noul"; readonly noul: number }
  | {
      readonly key: string;
      readonly type: "choice";
      readonly choice: string;
      readonly probabilities: Readonly<Record<string, number>>;
    };

export interface SystemOneResponse {
  readonly answers: readonly SystemOneAnswer[];
}

export interface DecisionGate {
  readonly id: string;
  decide(request: SystemOneRequest, signal?: AbortSignal): Promise<SystemOneResponse>;
}

export const MEMORY_KINDS = ["fact", "preference", "person", "date_event", "health", "correction", "none"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_GATE_QUESTIONS: readonly SystemOneQuestion[] = [
  {
    key: "memory_worthy",
    type: "noul",
    question:
      "Does the user's latest message contain personal information worth remembering in future conversations " +
      "(a fact, preference, person, date, plan, health detail, or a correction of something said before)?",
  },
  {
    key: "kind",
    type: "choice",
    question: "What kind of information worth remembering does the user's latest message mainly contain?",
    choices: MEMORY_KINDS,
  },
  {
    key: "is_correction",
    type: "noul",
    question: "Does the user's latest message correct or change something the user said or that was known before?",
  },
];

export interface GateVerdict {
  readonly worthy: boolean;
  readonly worthyProbability: number;
  readonly kind: MemoryKind;
  readonly isCorrection: boolean;
}

/** Reads the memory questions' answers; `threshold` favours recall when low. */
export function memoryGateVerdict(response: SystemOneResponse, threshold: number): GateVerdict {
  const answer = (key: string) => response.answers.find((entry) => entry.key === key);
  const worthy = answer("memory_worthy");
  const kind = answer("kind");
  const correction = answer("is_correction");
  const worthyProbability = worthy?.type === "noul" ? worthy.noul : 1;
  const kindChoice = kind?.type === "choice" && (MEMORY_KINDS as readonly string[]).includes(kind.choice)
    ? (kind.choice as MemoryKind)
    : "fact";
  const isCorrection = correction?.type === "noul" ? correction.noul >= 0.5 : false;
  return {
    worthy: worthyProbability >= threshold || isCorrection,
    worthyProbability,
    kind: kindChoice,
    isCorrection,
  };
}

/** The gate state for a user turn: the preceding assistant turn is context only. */
export function memoryGateState(userTurn: string, previousAssistantTurn?: string): string {
  return [
    previousAssistantTurn ? `Assistant (context only): ${previousAssistantTurn}` : undefined,
    `User (latest message): ${userTurn}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const LETTERS = "ABCDEFGHIJ";

function softmax(logprobs: readonly number[]): number[] {
  const max = Math.max(...logprobs);
  const exp = logprobs.map((value) => Math.exp(value - max));
  const sum = exp.reduce((total, value) => total + value, 0);
  return exp.map((value) => value / sum);
}

/**
 * A gate backed by a small local LLM. Each question is asked as a lettered
 * multiple-choice prompt with one output token; option probabilities come
 * from the first token's log-probabilities (falling back to the answer text).
 */
export class LlmDecisionGate implements DecisionGate {
  readonly id: string;
  private readonly client: ChatClient;

  constructor(client: ChatClient) {
    this.client = client;
    this.id = `llm-gate:${client.id}`;
  }

  async decide(request: SystemOneRequest, signal?: AbortSignal): Promise<SystemOneResponse> {
    const answers = await Promise.all(request.questions.map((question) => this.ask(request.state, question, signal)));
    return { answers };
  }

  private async ask(state: string, question: SystemOneQuestion, signal?: AbortSignal): Promise<SystemOneAnswer> {
    const options = question.type === "noul" ? ["yes", "no"] : [...question.choices];
    const letters = options.map((_, index) => LETTERS[index]!);
    const completion = await this.client.complete({
      messages: [
        {
          role: "system",
          content:
            "You classify conversation states. The text may be in Dutch or English. " +
            "Answer with exactly one capital letter and nothing else.",
        },
        {
          role: "user",
          content: [
            `State:\n${state}`,
            `Question: ${question.question}`,
            "Options:",
            ...options.map((option, index) => `${letters[index]}) ${option}`),
            "Answer:",
          ].join("\n"),
        },
      ],
      maxTokens: 1,
      temperature: 0,
      topLogprobs: 10,
      ...(signal ? { signal } : {}),
    });
    const logprobByLetter = new Map<string, number>();
    for (const entry of completion.firstTokenLogprobs ?? []) {
      const token = entry.token.trim().replace(/[).:]$/, "").toUpperCase();
      const position = letters.indexOf(token);
      if (position >= 0 && !logprobByLetter.has(token)) logprobByLetter.set(token, entry.logprob);
    }
    let probabilities: number[];
    if (logprobByLetter.size > 0) {
      const present = letters.filter((letter) => logprobByLetter.has(letter));
      const values = softmax(present.map((letter) => logprobByLetter.get(letter)!));
      probabilities = letters.map((letter) => {
        const position = present.indexOf(letter);
        return position >= 0 ? values[position]! : 0;
      });
    } else {
      const answer = completion.content.trim().charAt(0).toUpperCase();
      const position = letters.indexOf(answer);
      if (position < 0) throw new Error(`Gate model gave no valid option for "${question.key}".`);
      probabilities = letters.map((_, index) => (index === position ? 1 : 0));
    }
    if (question.type === "noul") return { key: question.key, type: "noul", noul: probabilities[0]! };
    const best = probabilities.indexOf(Math.max(...probabilities));
    return {
      key: question.key,
      type: "choice",
      choice: options[best]!,
      probabilities: Object.fromEntries(options.map((option, index) => [option, probabilities[index]!])),
    };
  }
}

/** Passes every turn to extraction (for development without a gate model). */
export class PassThroughGate implements DecisionGate {
  readonly id = "pass-through";

  async decide(request: SystemOneRequest): Promise<SystemOneResponse> {
    return {
      answers: request.questions.map((question): SystemOneAnswer =>
        question.type === "noul"
          ? { key: question.key, type: "noul", noul: question.key === "is_correction" ? 0 : 1 }
          : {
              key: question.key,
              type: "choice",
              choice: question.choices[0]!,
              probabilities: Object.fromEntries(question.choices.map((choice, index) => [choice, index === 0 ? 1 : 0])),
            },
      ),
    };
  }
}
