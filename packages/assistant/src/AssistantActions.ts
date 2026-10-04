export type AppActionRisk =
  | "read"
  | "navigate"
  | "draft"
  | "safe-control"
  | "external-effect"
  | "destructive";

export interface AppActionInputProperty {
  readonly type: "string" | "number" | "boolean";
  readonly description?: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly maxLength?: number;
}

export interface AppActionInputSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, AppActionInputProperty>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface AssistantActionInvocation {
  readonly id: string;
  readonly arguments: unknown;
}

export interface AvailableAppAction {
  readonly id: string;
  readonly description: string;
  readonly risk: AppActionRisk;
  readonly requiresConfirmation: boolean;
  readonly inputSchema: AppActionInputSchema;
  readonly confirmationPhrase?: string;
}

export interface PendingActionConfirmation {
  readonly id: string;
  readonly actionId: string;
  readonly summary: string;
  readonly confirmationPhrase: string;
}

export interface AppActionDefinition extends AvailableAppAction {
  readonly confirmationSummary?: (
    arguments_: Readonly<Record<string, unknown>>,
  ) => string;
  readonly execute: (
    arguments_: Readonly<Record<string, unknown>>,
  ) => string | Promise<string>;
}

export type AssistantActionResult =
  | { readonly status: "completed"; readonly message: string }
  | {
      readonly status: "confirmation-required";
      readonly message: string;
      readonly pending: PendingActionConfirmation;
    }
  | { readonly status: "cancelled"; readonly message: string };

export interface AssistantActionRuntime {
  getAvailableActions(): readonly AvailableAppAction[];
  getPendingConfirmation(): PendingActionConfirmation | undefined;
  invoke(
    invocation: AssistantActionInvocation,
  ): Promise<AssistantActionResult>;
  confirm(confirmationId: string): Promise<AssistantActionResult>;
  cancel(confirmationId: string): AssistantActionResult;
  respondToConfirmation(
    message: string,
  ): Promise<AssistantActionResult | undefined>;
}

export interface AssistantActionRuntimeOptions {
  readonly createConfirmationId?: () => string;
}

const ACTION_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const CONFIRMATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTION_RISKS: readonly AppActionRisk[] = [
  "read",
  "navigate",
  "draft",
  "safe-control",
  "external-effect",
  "destructive",
];
const HIGH_RISK_ACTIONS = new Set<AppActionRisk>([
  "external-effect",
  "destructive",
]);
const CANCELLATION_PHRASES = new Set(["cancel", "cancel action"]);
let fallbackConfirmationSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizedPhrase(phrase: string): string {
  return phrase
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ");
}

function requiresConfirmation(action: AppActionDefinition): boolean {
  return action.requiresConfirmation || HIGH_RISK_ACTIONS.has(action.risk);
}

function cloneArguments(value: Record<string, unknown>): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("Action arguments must contain only JSON values.");
  }
  if (!serialized) {
    throw new TypeError("Action arguments must contain only JSON values.");
  }
  const cloned: unknown = JSON.parse(serialized);
  if (!isRecord(cloned)) {
    throw new TypeError("Action arguments must be a JSON object.");
  }
  return cloned;
}

function validateArguments(
  action: AppActionDefinition,
  input: unknown,
): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new TypeError(`Action "${action.id}" arguments must be an object.`);
  }
  const arguments_ = cloneArguments(input);
  const { properties } = action.inputSchema;
  for (const required of action.inputSchema.required ?? []) {
    if (!Object.hasOwn(arguments_, required)) {
      throw new TypeError(
        `Action "${action.id}" requires the "${required}" argument.`,
      );
    }
  }
  for (const [key, value] of Object.entries(arguments_)) {
    const schema = properties[key];
    if (!schema) {
      if (action.inputSchema.additionalProperties === true) continue;
      throw new TypeError(`Action "${action.id}" does not accept "${key}".`);
    }
    if (
      typeof value !== schema.type ||
      (schema.type === "number" && !Number.isFinite(value as number))
    ) {
      throw new TypeError(
        `Action "${action.id}" argument "${key}" must be ${schema.type}.`,
      );
    }
    if (
      schema.maxLength !== undefined &&
      typeof value === "string" &&
      value.length > schema.maxLength
    ) {
      throw new RangeError(
        `Action "${action.id}" argument "${key}" exceeds ${schema.maxLength} characters.`,
      );
    }
    if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
      throw new TypeError(
        `Action "${action.id}" argument "${key}" has an unsupported value.`,
      );
    }
  }
  return arguments_;
}

function validateDefinition(action: AppActionDefinition): void {
  if (!ACTION_ID_PATTERN.test(action.id)) {
    throw new TypeError(`Action ID "${action.id}" is invalid.`);
  }
  if (!action.description.trim()) {
    throw new TypeError(`Action "${action.id}" requires a description.`);
  }
  if (!ACTION_RISKS.includes(action.risk)) {
    throw new TypeError(`Action "${action.id}" has an invalid risk level.`);
  }
  if (action.inputSchema.type !== "object") {
    throw new TypeError(`Action "${action.id}" requires an object input schema.`);
  }
  for (const [name, property] of Object.entries(action.inputSchema.properties)) {
    if (
      !name.trim() ||
      !["string", "number", "boolean"].includes(property.type) ||
      (property.description !== undefined &&
        typeof property.description !== "string") ||
      (property.maxLength !== undefined &&
        (!Number.isInteger(property.maxLength) || property.maxLength < 0)) ||
      (property.enum !== undefined &&
        (!Array.isArray(property.enum) ||
          property.enum.some((value) => typeof value !== property.type)))
    ) {
      throw new TypeError(`Action "${action.id}" has an invalid input schema.`);
    }
  }
  for (const required of action.inputSchema.required ?? []) {
    if (!Object.hasOwn(action.inputSchema.properties, required)) {
      throw new TypeError(
        `Action "${action.id}" requires an undefined "${required}" argument.`,
      );
    }
  }
  if (
    requiresConfirmation(action) &&
    (!action.confirmationPhrase?.trim() ||
      typeof action.confirmationSummary !== "function")
  ) {
    throw new TypeError(
      `Action "${action.id}" requires a confirmation phrase and summary.`,
    );
  }
}

function createId(): string {
  fallbackConfirmationSequence += 1;
  return (
    globalThis.crypto?.randomUUID?.() ??
    `confirmation:${Date.now().toString(36)}-${fallbackConfirmationSequence.toString(36)}`
  );
}

export function createAssistantActionRuntime(
  definitions:
    | readonly AppActionDefinition[]
    | (() => readonly AppActionDefinition[]),
  options: AssistantActionRuntimeOptions = {},
): AssistantActionRuntime {
  let pending:
    | {
        readonly confirmation: PendingActionConfirmation;
        readonly definition: AppActionDefinition;
        readonly arguments: Readonly<Record<string, unknown>>;
      }
    | undefined;
  const issuedConfirmationIds = new Set<string>();
  const readDefinitions = () =>
    typeof definitions === "function" ? definitions() : definitions;
  const findDefinition = (id: string) => {
    const current = readDefinitions();
    const matches = current.filter((action) => action.id === id);
    if (matches.length > 1) {
      throw new Error(`Action "${id}" is registered more than once.`);
    }
    const action = matches[0];
    if (!action) throw new Error(`Action "${id}" is not available.`);
    validateDefinition(action);
    return action;
  };
  const execute = async (
    action: AppActionDefinition,
    arguments_: Readonly<Record<string, unknown>>,
  ): Promise<AssistantActionResult> => ({
    status: "completed",
    message: await action.execute(arguments_),
  });
  const confirm = async (
    confirmationId: string,
  ): Promise<AssistantActionResult> => {
    if (!pending || pending.confirmation.id !== confirmationId) {
      throw new Error("No matching action confirmation is pending.");
    }
    const exactPendingAction = pending;
    pending = undefined;
    return execute(exactPendingAction.definition, exactPendingAction.arguments);
  };

  return {
    getAvailableActions() {
      return readDefinitions().map((action) => {
        validateDefinition(action);
        return {
          id: action.id,
          description: action.description,
          risk: action.risk,
          requiresConfirmation: requiresConfirmation(action),
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              Object.entries(action.inputSchema.properties).map(
                ([name, property]) => [
                  name,
                  {
                    ...property,
                    ...(property.enum ? { enum: [...property.enum] } : {}),
                  },
                ],
              ),
            ),
            ...(action.inputSchema.required
              ? { required: [...action.inputSchema.required] }
              : {}),
            ...(action.inputSchema.additionalProperties !== undefined
              ? { additionalProperties: action.inputSchema.additionalProperties }
              : {}),
          },
          ...(action.confirmationPhrase
            ? { confirmationPhrase: action.confirmationPhrase }
            : {}),
        };
      });
    },

    getPendingConfirmation() {
      return pending?.confirmation;
    },

    async invoke(invocation) {
      if (pending) {
        throw new Error("Resolve the pending action before starting another.");
      }
      const action = findDefinition(invocation.id);
      const arguments_ = validateArguments(action, invocation.arguments);
      if (!requiresConfirmation(action)) return execute(action, arguments_);

      const confirmationPhrase = action.confirmationPhrase;
      const summary = action.confirmationSummary?.(arguments_);
      if (!confirmationPhrase || !summary?.trim()) {
        throw new Error(`Action "${action.id}" has no valid confirmation prompt.`);
      }
      const confirmationId = (options.createConfirmationId ?? createId)();
      if (
        !CONFIRMATION_ID_PATTERN.test(confirmationId) ||
        issuedConfirmationIds.has(confirmationId)
      ) {
        throw new Error("A unique valid action confirmation ID is required.");
      }
      if (summary.length > 10_000) {
        throw new Error(`Action "${action.id}" confirmation summary is too long.`);
      }
      issuedConfirmationIds.add(confirmationId);
      const confirmation = Object.freeze({
        id: confirmationId,
        actionId: action.id,
        summary: summary.trim(),
        confirmationPhrase,
      });
      pending = { confirmation, definition: action, arguments: arguments_ };
      return {
        status: "confirmation-required",
        message: confirmation.summary,
        pending: confirmation,
      };
    },

    confirm,

    cancel(confirmationId) {
      if (!pending || pending.confirmation.id !== confirmationId) {
        throw new Error("No matching action confirmation is pending.");
      }
      pending = undefined;
      return { status: "cancelled", message: "Action cancelled." };
    },

    async respondToConfirmation(message) {
      if (!pending) return undefined;
      const response = normalizedPhrase(message);
      if (
        response === normalizedPhrase(pending.confirmation.confirmationPhrase)
      ) {
        return confirm(pending.confirmation.id);
      }
      if (
        CANCELLATION_PHRASES.has(response) ||
        response.startsWith("cancel ")
      ) {
        return this.cancel(pending.confirmation.id);
      }
      pending = undefined;
      return undefined;
    },
  };
}
