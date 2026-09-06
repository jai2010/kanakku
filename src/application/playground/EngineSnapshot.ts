export type EngineEventType =
  | 'PURCHASE'
  | 'REFUND'
  | 'PAYMENT'
  | 'USAGE'
  | 'WALLET_LOAD'
  | 'WALLET_SPEND'
  | 'MARKETPLACE_SALE'
  | 'SELLER_PAYOUT';

export type EngineParticipantKind = 'BUYER' | 'SELLER';
export type EngineTransactionalEffectType =
  | 'WALLET_LOAD'
  | 'WALLET_SPEND'
  | 'SALE'
  | 'FEE'
  | 'TAX'
  | 'COMMISSION'
  | 'WITHHOLDING'
  | 'ADJUSTMENT'
  | 'PAYOUT';
export type EngineAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type EngineBalanceSide = 'DEBIT' | 'CREDIT';

export type EngineLineView = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type EngineConditionView = {
  field: string;
  op: string;
  value: string;
};

export type EngineAmountType = 'EVENT_AMOUNT' | 'FIXED_AMOUNT' | 'ATTRIBUTE_AMOUNT' | 'RATE_AMOUNT';

export type EngineTransactionalEffectView = {
  type: EngineTransactionalEffectType;
  direction: 'CREDIT' | 'DEBIT';
  amountLabel: string;
  description: string;
};

export type EngineTransactionalTreatmentView = {
  participantKind: EngineParticipantKind;
  participantField: string;
  effects: EngineTransactionalEffectView[];
};

export type EngineEffectLineView = {
  type: EngineTransactionalEffectType;
  description: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  signedAmount: number;
};

export type EngineCompositionView = {
  lines: EngineEffectLineView[];
  total: number;
};

export type EngineTransactionalResultView = {
  accountId: string;
  participantId: string;
  participantKind: EngineParticipantKind;
  participantName: string;
  effects: EngineEffectLineView[];
  composition: EngineCompositionView;
  balanceAfter: number;
};

export type EngineTreatmentLineView = {
  side: 'DEBIT' | 'CREDIT';
  accountCode: string;
  accountName: string;
  accountType: EngineAccountType;
  amountType: EngineAmountType;
  amountLabel: string;
  description: string | null;
};

export type EngineRuleView = {
  id: string;
  displayId: string;
  name: string;
  conditions: string[];
  conditionDetails: EngineConditionView[];
  lines: EngineTreatmentLineView[];
  debitCode: string;
  debitName: string;
  creditCode: string;
  creditName: string;
  activity: EngineEventType | null;
  priority: number;
  enabled: boolean;
  builtin: boolean;
  transactional: EngineTransactionalTreatmentView | null;
};

export type EnginePolicyView = {
  name: string;
  version: number;
  status: 'ACTIVE' | 'NONE';
  effectiveFrom: string;
  dsl: string;
  transformationCount: number;
};

export type EngineSimulationView = {
  source: 'transaction' | 'conditions';
  eventId: string | null;
  merchant: string;
  amount: number;
  type: EngineEventType;
  matched: boolean;
  reason: string;
  selectedRuleDisplayId: string | null;
  selectedRuleName: string | null;
  intendedRuleDisplayId: string | null;
  conditionsSatisfied: boolean;
  accountsResolved: boolean;
  balanced: boolean;
  wouldPost: boolean;
  lines: EngineLineView[];
  totalDebits: number;
  totalCredits: number;
  error: string | null;
};

export type EngineUsageView = {
  meter: string;
  quantity: number;
  unitPrice: number;
  unit: string;
};

export type EngineExampleView = {
  key: string;
  merchant: string;
  amount: number;
  type: EngineEventType;
  category: string;
  mark: string;
  tint: string;
  usage?: EngineUsageView;
};

export type EngineTransactionView = {
  eventId: string;
  displayId: string;
  occurredAt: string;
  source: string;
  type: EngineEventType;
  counterparty: string;
  category: string;
  description: string;
  amount: number;
  currency: string;
  usage: EngineUsageView | null;
  accountingStatus: 'NOT_ACCOUNTED' | 'ACCOUNTED' | 'FAILED';
  pipeline: {
    captured: true;
    rated: boolean;
    accounted: boolean;
    unmatched: boolean;
    failed: boolean;
    tracked: boolean;
  };
  journalId: string | null;
  journalDisplayId: string | null;
  selectedRule: string | null;
  selectedRuleName: string | null;
  accountCodes: string[];
  participantId: string | null;
  participantKind: EngineParticipantKind | null;
  participantName: string | null;
  orderId: string | null;
  tracked: boolean;
  effects: EngineEffectLineView[];
  composition: EngineCompositionView | null;
};

export type EngineStageId = 'policy' | 'rules' | 'accounts' | 'journal' | 'validator' | 'ledger';

export type EngineStageView = {
  id: EngineStageId;
  kicker: string;
  title: string;
  headline: string;
  detail: string;
  tone: 'ok' | 'warn' | 'idle';
};

export type EngineBalanceImpactView = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: EngineAccountType;
  currency: string;
  debit: number;
  credit: number;
  previousBalance: number;
  previousBalanceSide: EngineBalanceSide;
  nextBalance: number;
  nextBalanceSide: EngineBalanceSide;
};

export type EngineProcessResult = {
  eventId: string;
  merchant: string;
  amount: number;
  type: EngineEventType;
  category: string;
  mark: string;
  tint: string;
  evaluation: {
    matched: boolean;
    reason: string;
    selectedRule: EngineRuleView | null;
    rulesScanned: number;
  };
  journal: {
    id: string;
    displayId: string;
    lines: EngineLineView[];
    totalDebits: number;
    totalCredits: number;
    balanced: boolean;
    posted: boolean;
    kernelMs: number;
  } | null;
  stages: EngineStageView[];
  log: Array<{ title: string; detail: string; tone: 'ok' | 'warn' }>;
  error: string | null;
  balanceImpact: EngineBalanceImpactView[];
  transactional: EngineTransactionalResultView | null;
};

export type EngineLedgerEntryView = {
  eventId: string;
  transactionDisplayId: string | null;
  journalId: string | null;
  journalDisplayId: string | null;
  merchant: string;
  amount: number;
  type: EngineEventType;
  category: string;
  posted: boolean;
  balanced: boolean;
  selectedRule: string | null;
  lines: EngineLineView[];
  totalDebits: number;
  totalCredits: number;
  postedAt: string;
  transactionDate: string;
  description: string;
  status: 'POSTED' | 'REVERSED' | 'HELD';
};

export type EngineAccountBalanceView = {
  accountId: string;
  code: string;
  name: string;
  type: EngineAccountType;
  currency: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  balanceSide: EngineBalanceSide;
  entryCount: number;
};

export type EngineAccountLedgerLineView = {
  id: string;
  journalId: string;
  journalDisplayId: string;
  eventId: string;
  transactionDate: string;
  postedAt: string;
  description: string;
  merchant: string;
  debit: number;
  credit: number;
  currency: string;
  runningBalance: number;
  runningBalanceSide: EngineBalanceSide;
  selectedRule: string | null;
  journalStatus: 'POSTED' | 'REVERSED';
};

export type EngineAccountLedgerView = {
  accountId: string;
  code: string;
  name: string;
  type: EngineAccountType;
  currency: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  balanceSide: EngineBalanceSide;
  entries: EngineAccountLedgerLineView[];
};

export type EngineTrialBalanceLineView = {
  accountId: string;
  code: string;
  name: string;
  type: EngineAccountType;
  debit: number;
  credit: number;
};

export type EngineTrialBalanceView = {
  asOf: string;
  currency: string;
  lines: EngineTrialBalanceLineView[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
};

export type EngineTypeTotalView = {
  type: EngineAccountType;
  balance: number;
  balanceSide: EngineBalanceSide;
};

export type EngineLedgerTotalsView = {
  accountCount: number;
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
  asOf: string | null;
  from: string | null;
  to: string | null;
  typeTotals: EngineTypeTotalView[];
};

export type EngineParticipantView = {
  accountId: string;
  participantId: string;
  kind: EngineParticipantKind;
  name: string;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE';
  balance: number;
  entryCount: number;
};

export type EngineParticipantLedgerLineView = {
  id: string;
  businessEventId: string;
  transactionDisplayId: string | null;
  type: EngineTransactionalEffectType;
  description: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  signedAmount: number;
  effectiveAt: string;
  runningBalance: number;
};

export type EngineParticipantLedgerView = EngineParticipantView & {
  entries: EngineParticipantLedgerLineView[];
};

export type EngineSnapshot = {
  rules: EngineRuleView[];
  examples: EngineExampleView[];
  accounts: Array<{ code: string; name: string; type: EngineAccountType; parentCode: string | null; currency: string }>;
  transactions: EngineTransactionView[];
  participants: EngineParticipantView[];
  participantLedgers: EngineParticipantLedgerView[];
  ledger: EngineLedgerEntryView[];
  accountBalances: EngineAccountBalanceView[];
  accountLedgers: EngineAccountLedgerView[];
  trialBalance: EngineTrialBalanceView;
  ledgerTotals: EngineLedgerTotalsView;
  metrics: {
    rules: number;
    avgMs: number;
    balancedPct: number;
    errors: number;
    posted: number;
  };
  lastResult: EngineProcessResult | null;
  policy: EnginePolicyView | null;
  lastSimulation: EngineSimulationView | null;
};
