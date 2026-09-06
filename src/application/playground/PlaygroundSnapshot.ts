import { PolicyVersionStatus } from '../../domain/policies/PolicyVersion';

export type PlaygroundAction =
  | 'author'
  | 'replaceDsl'
  | 'validate'
  | 'simulate'
  | 'approve'
  | 'activate'
  | 'process'
  | 'reset';

export type PlaygroundAuthoringStatus =
  | 'IDLE'
  | 'COMPILED'
  | 'NEEDS_CLARIFICATION'
  | 'UNSUPPORTED'
  | 'REJECTED';

export type PlaygroundLineView = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type PlaygroundSimulationEventView = {
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
};

export type PlaygroundLedgerEntryView = {
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
};

export type PlaygroundSnapshot = {
  instruction: string;
  dsl: string;
  authoringStatus: PlaygroundAuthoringStatus;
  policyStatus: PolicyVersionStatus | null;
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
    events: PlaygroundSimulationEventView[];
    totalDebits: number;
    totalCredits: number;
  } | null;
  ledger: {
    entries: PlaygroundLedgerEntryView[];
    postedCount: number;
  } | null;
  accounts: Array<{ code: string; name: string }>;
  sampleEvents: Array<{ id: string; label: string; amount: number; counterparty: string }>;
  allowedActions: PlaygroundAction[];
};
