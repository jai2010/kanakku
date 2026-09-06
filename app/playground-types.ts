import { z } from 'zod';

export type PlaygroundAction =
  | 'author'
  | 'replaceDsl'
  | 'validate'
  | 'simulate'
  | 'approve'
  | 'activate'
  | 'process'
  | 'reset';

export type PlaygroundLineView = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type PlaygroundSnapshot = {
  instruction: string;
  dsl: string;
  authoringStatus: 'IDLE' | 'COMPILED' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED' | 'REJECTED';
  policyStatus: string | null;
  provider: string;
  clarificationNeeds: string[];
  unsupportedReason: string | null;
  error: string | null;
  validation: {
    valid: boolean;
    issues: Array<{ code: string; message: string }>;
  } | null;
  simulation: {
    didPost: boolean;
    events: Array<{
      eventId: string;
      label: string;
      matched: boolean;
      reason: string;
      wouldPost: boolean;
      selectedRuleId: string | null;
      lines: PlaygroundLineView[];
      totalDebits: number;
      totalCredits: number;
      error?: string;
    }>;
    totalDebits: number;
    totalCredits: number;
  } | null;
  ledger: {
    entries: Array<{
      eventId: string;
      label: string;
      posted: boolean;
      status?: string;
      reason: string;
      lines: PlaygroundLineView[];
      totalDebits: number;
      totalCredits: number;
      balanced: boolean;
      error?: string;
    }>;
    postedCount: number;
  } | null;
  accounts: Array<{ code: string; name: string }>;
  sampleEvents: Array<{ id: string; label: string; amount: number; counterparty: string }>;
  allowedActions: PlaygroundAction[];
};

export const STATIONS = [
  'INTENT',
  'AI',
  'DSL',
  'POLICY',
  'SIMULATION',
  'APPROVAL',
  'ENGINE',
  'LEDGER'
] as const;

export function activeStation(snapshot: PlaygroundSnapshot): (typeof STATIONS)[number] {
  if (snapshot.ledger !== null) {
    return 'LEDGER';
  }
  if (snapshot.policyStatus === 'ACTIVE') {
    return 'ENGINE';
  }
  if (snapshot.policyStatus === 'APPROVED') {
    return 'APPROVAL';
  }
  if (snapshot.policyStatus === 'SIMULATED' || snapshot.simulation !== null) {
    return 'SIMULATION';
  }
  if (snapshot.policyStatus === 'VALIDATED') {
    return 'POLICY';
  }
  if (snapshot.authoringStatus === 'COMPILED' || snapshot.authoringStatus === 'REJECTED') {
    return 'DSL';
  }
  if (snapshot.authoringStatus === 'NEEDS_CLARIFICATION' || snapshot.authoringStatus === 'UNSUPPORTED') {
    return 'AI';
  }
  return 'INTENT';
}

export function rupee(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

const LineSchema = z.object({
  accountCode: z.string(),
  accountName: z.string(),
  debit: z.number(),
  credit: z.number()
});

const SnapshotSchema = z.object({
  instruction: z.string(),
  dsl: z.string(),
  authoringStatus: z.enum(['IDLE', 'COMPILED', 'NEEDS_CLARIFICATION', 'UNSUPPORTED', 'REJECTED']),
  policyStatus: z.string().nullable(),
  provider: z.string(),
  clarificationNeeds: z.array(z.string()),
  unsupportedReason: z.string().nullable(),
  error: z.string().nullable(),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(z.object({ code: z.string(), message: z.string() }))
  }).nullable(),
  simulation: z.object({
    didPost: z.boolean(),
    events: z.array(z.object({
      eventId: z.string(),
      label: z.string(),
      matched: z.boolean(),
      reason: z.string(),
      wouldPost: z.boolean(),
      selectedRuleId: z.string().nullable(),
      lines: z.array(LineSchema),
      totalDebits: z.number(),
      totalCredits: z.number(),
      error: z.string().optional()
    })),
    totalDebits: z.number(),
    totalCredits: z.number()
  }).nullable(),
  ledger: z.object({
    entries: z.array(z.object({
      eventId: z.string(),
      label: z.string(),
      posted: z.boolean(),
      status: z.string().optional(),
      reason: z.string(),
      lines: z.array(LineSchema),
      totalDebits: z.number(),
      totalCredits: z.number(),
      balanced: z.boolean(),
      error: z.string().optional()
    })),
    postedCount: z.number()
  }).nullable(),
  accounts: z.array(z.object({ code: z.string(), name: z.string() })),
  sampleEvents: z.array(z.object({
    id: z.string(),
    label: z.string(),
    amount: z.number(),
    counterparty: z.string()
  })),
  allowedActions: z.array(z.enum([
    'author', 'replaceDsl', 'validate', 'simulate', 'approve', 'activate', 'process', 'reset'
  ]))
});

export function parsePlaygroundSnapshot(value: unknown): PlaygroundSnapshot {
  return SnapshotSchema.parse(value);
}
