import { z } from 'zod';

export type EngineView = 'transactions' | 'engine' | 'studio' | 'ledger' | 'recon' | 'settings';
export type StudioPane = 'overview' | 'activities' | 'sources' | 'transformations' | 'accounts' | 'versions';
export type EngineMode = 'live' | 'step';
export const ENGINE_EVENT_TYPES = [
  'PURCHASE',
  'REFUND',
  'PAYMENT',
  'USAGE',
  'WALLET_LOAD',
  'WALLET_SPEND',
  'MARKETPLACE_SALE',
  'SELLER_PAYOUT'
] as const;
export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];
export type EngineStageId = 'policy' | 'rules' | 'accounts' | 'journal' | 'validator' | 'ledger';
export type EngineAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type EngineBalanceSide = 'DEBIT' | 'CREDIT';
export type EngineLedgerPane = 'overview' | 'transactions' | 'accounts' | 'journals' | 'trial';
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

export const STAGE_ORDER: EngineStageId[] = ['policy', 'rules', 'accounts', 'journal', 'validator', 'ledger'];

const LineSchema = z.object({
  accountCode: z.string(),
  accountName: z.string(),
  debit: z.number(),
  credit: z.number()
});

const EventTypeSchema = z.enum(ENGINE_EVENT_TYPES);
const AmountTypeSchema = z.enum(['EVENT_AMOUNT', 'FIXED_AMOUNT', 'ATTRIBUTE_AMOUNT', 'RATE_AMOUNT']);
const ParticipantKindSchema = z.enum(['BUYER', 'SELLER']);
const EffectTypeSchema = z.enum([
  'WALLET_LOAD',
  'WALLET_SPEND',
  'SALE',
  'FEE',
  'TAX',
  'COMMISSION',
  'WITHHOLDING',
  'ADJUSTMENT',
  'PAYOUT'
]);
const EffectLineSchema = z.object({
  type: EffectTypeSchema,
  description: z.string(),
  amount: z.number(),
  direction: z.enum(['CREDIT', 'DEBIT']),
  signedAmount: z.number()
});
const CompositionSchema = z.object({
  lines: z.array(EffectLineSchema),
  total: z.number()
});
const TransactionalResultSchema = z.object({
  accountId: z.string(),
  participantId: z.string(),
  participantKind: ParticipantKindSchema,
  participantName: z.string(),
  effects: z.array(EffectLineSchema),
  composition: CompositionSchema,
  balanceAfter: z.number()
});
const TransactionalTreatmentSchema = z.object({
  participantKind: ParticipantKindSchema,
  participantField: z.string(),
  effects: z.array(z.object({
    type: EffectTypeSchema,
    direction: z.enum(['CREDIT', 'DEBIT']),
    amountLabel: z.string(),
    description: z.string()
  }))
});

const TreatmentLineSchema = z.object({
  side: z.enum(['DEBIT', 'CREDIT']),
  accountCode: z.string(),
  accountName: z.string(),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  amountType: AmountTypeSchema,
  amountLabel: z.string(),
  description: z.string().nullable()
});

const RuleSchema = z.object({
  id: z.string(),
  displayId: z.string(),
  name: z.string(),
  conditions: z.array(z.string()),
  conditionDetails: z.array(z.object({
    field: z.string(),
    op: z.string(),
    value: z.string()
  })),
  lines: z.array(TreatmentLineSchema),
  debitCode: z.string(),
  debitName: z.string(),
  creditCode: z.string(),
  creditName: z.string(),
  activity: EventTypeSchema.nullable(),
  priority: z.number(),
  enabled: z.boolean(),
  builtin: z.boolean(),
  transactional: TransactionalTreatmentSchema.nullable()
});

const PolicySchema = z.object({
  name: z.string(),
  version: z.number(),
  status: z.enum(['ACTIVE', 'NONE']),
  effectiveFrom: z.string(),
  dsl: z.string(),
  transformationCount: z.number()
});

const SimulationSchema = z.object({
  source: z.enum(['transaction', 'conditions']),
  eventId: z.string().nullable(),
  merchant: z.string(),
  amount: z.number(),
  type: EventTypeSchema,
  matched: z.boolean(),
  reason: z.string(),
  selectedRuleDisplayId: z.string().nullable(),
  selectedRuleName: z.string().nullable(),
  intendedRuleDisplayId: z.string().nullable(),
  conditionsSatisfied: z.boolean(),
  accountsResolved: z.boolean(),
  balanced: z.boolean(),
  wouldPost: z.boolean(),
  lines: z.array(LineSchema),
  totalDebits: z.number(),
  totalCredits: z.number(),
  error: z.string().nullable()
});

const AccountTypeSchema = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);
const BalanceSideSchema = z.enum(['DEBIT', 'CREDIT']);

const BalanceImpactSchema = z.object({
  accountId: z.string(),
  accountCode: z.string(),
  accountName: z.string(),
  accountType: AccountTypeSchema,
  currency: z.string(),
  debit: z.number(),
  credit: z.number(),
  previousBalance: z.number(),
  previousBalanceSide: BalanceSideSchema,
  nextBalance: z.number(),
  nextBalanceSide: BalanceSideSchema
});

const ResultSchema = z.object({
  eventId: z.string(),
  merchant: z.string(),
  amount: z.number(),
  type: EventTypeSchema,
  category: z.string(),
  mark: z.string(),
  tint: z.string(),
  evaluation: z.object({
    matched: z.boolean(),
    reason: z.string(),
    selectedRule: RuleSchema.nullable(),
    rulesScanned: z.number()
  }),
  journal: z.object({
    id: z.string(),
    displayId: z.string(),
    lines: z.array(LineSchema),
    totalDebits: z.number(),
    totalCredits: z.number(),
    balanced: z.boolean(),
    posted: z.boolean(),
    kernelMs: z.number()
  }).nullable(),
  stages: z.array(z.object({
    id: z.enum(['policy', 'rules', 'accounts', 'journal', 'validator', 'ledger']),
    kicker: z.string(),
    title: z.string(),
    headline: z.string(),
    detail: z.string(),
    tone: z.enum(['ok', 'warn', 'idle'])
  })),
  log: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    tone: z.enum(['ok', 'warn'])
  })),
  error: z.string().nullable(),
  balanceImpact: z.array(BalanceImpactSchema),
  transactional: TransactionalResultSchema.nullable()
});

const AccountBalanceSchema = z.object({
  accountId: z.string(),
  code: z.string(),
  name: z.string(),
  type: AccountTypeSchema,
  currency: z.string(),
  totalDebits: z.number(),
  totalCredits: z.number(),
  balance: z.number(),
  balanceSide: BalanceSideSchema,
  entryCount: z.number()
});

const UsageSchema = z.object({
  meter: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  unit: z.string()
});

const TransactionSchema = z.object({
  eventId: z.string(),
  displayId: z.string(),
  occurredAt: z.string(),
  source: z.string(),
  type: EventTypeSchema,
  counterparty: z.string(),
  category: z.string().default(''),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  usage: UsageSchema.nullable(),
  accountingStatus: z.enum(['NOT_ACCOUNTED', 'ACCOUNTED', 'FAILED']),
  pipeline: z.object({
    captured: z.literal(true),
    rated: z.boolean(),
    accounted: z.boolean(),
    unmatched: z.boolean(),
    failed: z.boolean(),
    tracked: z.boolean()
  }),
  journalId: z.string().nullable(),
  journalDisplayId: z.string().nullable(),
  selectedRule: z.string().nullable(),
  selectedRuleName: z.string().nullable(),
  accountCodes: z.array(z.string()),
  participantId: z.string().nullable(),
  participantKind: ParticipantKindSchema.nullable(),
  participantName: z.string().nullable(),
  orderId: z.string().nullable(),
  tracked: z.boolean(),
  effects: z.array(EffectLineSchema),
  composition: CompositionSchema.nullable()
});

const AccountLedgerLineSchema = z.object({
  id: z.string(),
  journalId: z.string(),
  journalDisplayId: z.string(),
  eventId: z.string(),
  transactionDate: z.string(),
  postedAt: z.string(),
  description: z.string(),
  merchant: z.string(),
  debit: z.number(),
  credit: z.number(),
  currency: z.string(),
  runningBalance: z.number(),
  runningBalanceSide: BalanceSideSchema,
  selectedRule: z.string().nullable(),
  journalStatus: z.enum(['POSTED', 'REVERSED'])
});

const SnapshotSchema = z.object({
  rules: z.array(RuleSchema),
  examples: z.array(z.object({
    key: z.string(),
    merchant: z.string(),
    amount: z.number(),
    type: EventTypeSchema,
    category: z.string(),
    mark: z.string(),
    tint: z.string(),
    usage: UsageSchema.optional()
  })),
  accounts: z.array(z.object({
    code: z.string(),
    name: z.string(),
    type: AccountTypeSchema.optional(),
    parentCode: z.string().nullable().optional(),
    currency: z.string().optional()
  })),
  transactions: z.array(TransactionSchema),
  participants: z.array(z.object({
    accountId: z.string(),
    participantId: z.string(),
    kind: ParticipantKindSchema,
    name: z.string(),
    currency: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    balance: z.number(),
    entryCount: z.number()
  })),
  participantLedgers: z.array(z.object({
    accountId: z.string(),
    participantId: z.string(),
    kind: ParticipantKindSchema,
    name: z.string(),
    currency: z.string(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    balance: z.number(),
    entryCount: z.number(),
    entries: z.array(z.object({
      id: z.string(),
      businessEventId: z.string(),
      transactionDisplayId: z.string().nullable(),
      type: EffectTypeSchema,
      description: z.string(),
      amount: z.number(),
      direction: z.enum(['CREDIT', 'DEBIT']),
      signedAmount: z.number(),
      effectiveAt: z.string(),
      runningBalance: z.number()
    }))
  })),
  ledger: z.array(z.object({
    eventId: z.string(),
    transactionDisplayId: z.string().nullable(),
    journalId: z.string().nullable(),
    journalDisplayId: z.string().nullable(),
    merchant: z.string(),
    amount: z.number(),
    type: EventTypeSchema,
    category: z.string(),
    posted: z.boolean(),
    balanced: z.boolean(),
    selectedRule: z.string().nullable(),
    lines: z.array(LineSchema),
    totalDebits: z.number(),
    totalCredits: z.number(),
    postedAt: z.string(),
    transactionDate: z.string(),
    description: z.string(),
    status: z.enum(['POSTED', 'REVERSED', 'HELD'])
  })),
  accountBalances: z.array(AccountBalanceSchema),
  accountLedgers: z.array(z.object({
    accountId: z.string(),
    code: z.string(),
    name: z.string(),
    type: AccountTypeSchema,
    currency: z.string(),
    totalDebits: z.number(),
    totalCredits: z.number(),
    balance: z.number(),
    balanceSide: BalanceSideSchema,
    entries: z.array(AccountLedgerLineSchema)
  })),
  trialBalance: z.object({
    asOf: z.string(),
    currency: z.string(),
    lines: z.array(z.object({
      accountId: z.string(),
      code: z.string(),
      name: z.string(),
      type: AccountTypeSchema,
      debit: z.number(),
      credit: z.number()
    })),
    totalDebits: z.number(),
    totalCredits: z.number(),
    balanced: z.boolean()
  }),
  ledgerTotals: z.object({
    accountCount: z.number(),
    totalDebits: z.number(),
    totalCredits: z.number(),
    balanced: z.boolean(),
    asOf: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    typeTotals: z.array(z.object({
      type: AccountTypeSchema,
      balance: z.number(),
      balanceSide: BalanceSideSchema
    }))
  }),
  metrics: z.object({
    rules: z.number(),
    avgMs: z.number(),
    balancedPct: z.number(),
    errors: z.number(),
    posted: z.number()
  }),
  lastResult: ResultSchema.nullable(),
  policy: PolicySchema.nullable(),
  lastSimulation: SimulationSchema.nullable()
});

export type EngineSnapshot = z.infer<typeof SnapshotSchema>;
export type EngineRuleView = z.infer<typeof RuleSchema>;
export type EngineProcessResult = z.infer<typeof ResultSchema>;
export type EnginePolicyView = z.infer<typeof PolicySchema>;
export type EngineSimulationView = z.infer<typeof SimulationSchema>;
export type EngineTreatmentLineView = z.infer<typeof TreatmentLineSchema>;
export type EngineExampleView = EngineSnapshot['examples'][number];
export type EngineLedgerEntryView = EngineSnapshot['ledger'][number];
export type EngineStageView = EngineProcessResult['stages'][number];
export type EngineAccountBalanceView = EngineSnapshot['accountBalances'][number];
export type EngineAccountLedgerView = EngineSnapshot['accountLedgers'][number];
export type EngineAccountLedgerLineView = EngineAccountLedgerView['entries'][number];
export type EngineTransactionView = EngineSnapshot['transactions'][number];
export type EngineTrialBalanceView = EngineSnapshot['trialBalance'];
export type EngineBalanceImpactView = EngineProcessResult['balanceImpact'][number];
export type EngineParticipantView = EngineSnapshot['participants'][number];
export type EngineParticipantLedgerView = EngineSnapshot['participantLedgers'][number];

export function parseEngineSnapshot(value: unknown): EngineSnapshot {
  return SnapshotSchema.parse(value);
}

export function rupee(amount: number, type?: EngineEventType): string {
  const sign = type === 'REFUND' || amount < 0 ? '-' : '';
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

export function formatBalance(amount: number, side: EngineBalanceSide, emptyZero = false): string {
  if (emptyZero && amount === 0) {
    return '—';
  }
  return `${rupee(amount)} ${side === 'DEBIT' ? 'DR' : 'CR'}`;
}

export function formatMoneyCell(amount: number): string {
  if (amount === 0) {
    return '—';
  }
  return rupee(amount);
}

export function accountTypeLabel(type: EngineAccountType): string {
  if (type === 'ASSET') return 'Asset';
  if (type === 'LIABILITY') return 'Liability';
  if (type === 'EQUITY') return 'Equity';
  if (type === 'INCOME') return 'Income';
  return 'Expense';
}

export function formatLedgerDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function formatAsOf(iso: string | null): string {
  if (iso === null) {
    return 'No posted activity';
  }
  const date = new Date(iso);
  return `As of ${date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })}`;
}

export function typeLabel(type: EngineEventType): string {
  if (type === 'REFUND') {
    return 'Refund';
  }
  if (type === 'PAYMENT') {
    return 'Fee';
  }
  if (type === 'USAGE') {
    return 'Usage';
  }
  if (type === 'WALLET_LOAD') {
    return 'Wallet Load';
  }
  if (type === 'WALLET_SPEND') {
    return 'Wallet Purchase';
  }
  if (type === 'MARKETPLACE_SALE') {
    return 'Marketplace Sale';
  }
  if (type === 'SELLER_PAYOUT') {
    return 'Payout';
  }
  return 'Purchase';
}

export function activityLabel(type: EngineEventType): string {
  if (type === 'REFUND') {
    return 'Refunds';
  }
  if (type === 'PAYMENT') {
    return 'Payments';
  }
  if (type === 'USAGE') {
    return 'Usage';
  }
  if (type === 'WALLET_LOAD') {
    return 'Wallet loads';
  }
  if (type === 'WALLET_SPEND') {
    return 'Wallet purchases';
  }
  if (type === 'MARKETPLACE_SALE') {
    return 'Marketplace sales';
  }
  if (type === 'SELLER_PAYOUT') {
    return 'Payouts';
  }
  return 'Purchases';
}

export function activitySingular(type: EngineEventType): string {
  if (type === 'REFUND') {
    return 'Refund';
  }
  if (type === 'PAYMENT') {
    return 'Payment';
  }
  if (type === 'USAGE') {
    return 'Usage';
  }
  if (type === 'WALLET_LOAD') {
    return 'Wallet load';
  }
  if (type === 'WALLET_SPEND') {
    return 'Wallet purchase';
  }
  if (type === 'MARKETPLACE_SALE') {
    return 'Marketplace sale';
  }
  if (type === 'SELLER_PAYOUT') {
    return 'Payout';
  }
  return 'Purchase';
}

export function signedRupee(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

export function transactionKindLabel(type: EngineEventType): 'Purchases' | 'Wallet' | 'Marketplace Sales' | 'Payouts' | 'Other' {
  if (type === 'WALLET_LOAD' || type === 'WALLET_SPEND') {
    return 'Wallet';
  }
  if (type === 'MARKETPLACE_SALE') {
    return 'Marketplace Sales';
  }
  if (type === 'SELLER_PAYOUT') {
    return 'Payouts';
  }
  if (type === 'PURCHASE' || type === 'REFUND' || type === 'PAYMENT' || type === 'USAGE') {
    return 'Purchases';
  }
  return 'Other';
}

export function formatClock(iso?: string): string {
  const date = iso === undefined ? new Date() : new Date(iso);
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatAvg(ms: number): string {
  if (ms < 1000) {
    return `${Math.max(1, Math.round(ms))}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
