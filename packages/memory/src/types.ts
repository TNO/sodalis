/** Memory layers, numbered as Hy-Memory's `MemoryLayer` (ADR 0005). */
export const MEMORY_LAYERS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7"] as const;
export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

/** Layers stored as memory items; L1 lives in the turns table. */
export const ITEM_LAYERS = ["L0", "L2", "L3", "L4", "L5", "L6", "L7"] as const;
export type ItemLayer = (typeof ITEM_LAYERS)[number];

export const SENSITIVITIES = ["general", "health"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const PROVENANCES = ["stated", "inferred", "observed"] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const ITEM_STATUSES = ["active", "superseded"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const RETENTIONS = ["off", "7d", "30d", "90d", "forever"] as const;
export type Retention = (typeof RETENTIONS)[number];

export const CONSENT_KINDS = ["memory", "health"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export type TurnRole = "user" | "assistant" | "observation";

export interface Turn {
  readonly id: number;
  readonly sessionId: string;
  readonly turnId: string;
  readonly role: TurnRole;
  readonly text: string;
  readonly language?: string;
  /** Source of an observation, such as `home` or an app ID. */
  readonly source?: string;
  readonly createdAt: string;
}

export interface NewTurn {
  readonly sessionId: string;
  readonly turnId: string;
  readonly role: TurnRole;
  readonly text: string;
  readonly language?: string;
  readonly source?: string;
  readonly createdAt?: string;
}

export interface MemoryItem {
  readonly id: number;
  readonly layer: ItemLayer;
  readonly subject: string;
  readonly text: string;
  readonly sensitivity: Sensitivity;
  readonly provenance: Provenance;
  readonly status: ItemStatus;
  readonly confidence: number;
  readonly eventAt?: string;
  readonly validFrom: string;
  readonly validTo?: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewMemoryItem {
  readonly layer: ItemLayer;
  readonly subject: string;
  readonly text: string;
  readonly sensitivity?: Sensitivity;
  readonly provenance?: Provenance;
  readonly confidence?: number;
  readonly eventAt?: string;
  readonly validFrom?: string;
  /** L1 turns this item was derived from. */
  readonly sourceTurnIds?: readonly number[];
  /** L2 items this item was induced from (L5–L7). */
  readonly evidenceItemIds?: readonly number[];
}

export interface ItemRevision {
  readonly itemId: number;
  readonly revision: number;
  readonly text: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface ConsentRecord {
  readonly kind: ConsentKind;
  readonly granted: boolean;
  readonly policyVersion: string;
  readonly recordedAt: string;
}

export interface AuditEntry {
  readonly id: number;
  readonly at: string;
  readonly action: string;
  readonly itemId?: number;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export type Clock = () => Date;
