import {
  EngineEventType,
  EngineRuleView,
  EngineSnapshot,
  EngineTransactionView,
  StudioPane,
  activityLabel,
  activitySingular,
  rupee
} from './engine-types';

export const STUDIO_ACTIVITIES: EngineEventType[] = [
  'PURCHASE',
  'PAYMENT',
  'REFUND',
  'USAGE',
  'WALLET_LOAD',
  'WALLET_SPEND',
  'MARKETPLACE_SALE',
  'SELLER_PAYOUT'
];

const FIELD_LABELS: Record<string, string> = {
  eventType: 'Activity',
  type: 'Activity',
  counterparty: 'Counterparty',
  amount: 'Amount'
};

const OP_LABELS: Record<string, string> = {
  '=': 'equals',
  equals: 'equals',
  '!=': 'does not equal',
  not_equals: 'does not equal',
  '>': 'greater than',
  greater_than: 'greater than',
  '>=': 'at least',
  greater_than_or_equal: 'at least',
  '<': 'less than',
  less_than: 'less than',
  '<=': 'at most',
  less_than_or_equal: 'at most',
  IN: 'is one of',
  in: 'is one of',
  exists: 'exists',
  not_in: 'is not one of'
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/[._]/g, ' ');
}

export function operatorLabel(op: string): string {
  return OP_LABELS[op] ?? op;
}

export function conditionValueLabel(field: string, value: string): string {
  if (field === 'eventType' || field === 'type') {
    const key = value.toUpperCase();
    if (
      key === 'PURCHASE'
      || key === 'PAYMENT'
      || key === 'REFUND'
      || key === 'USAGE'
      || key === 'WALLET_LOAD'
      || key === 'WALLET_SPEND'
      || key === 'MARKETPLACE_SALE'
      || key === 'SELLER_PAYOUT'
    ) {
      return activitySingular(key);
    }
  }
  if (field === 'amount' && /^\d+(\.\d+)?$/.test(value)) {
    return rupee(Number(value));
  }
  return value;
}

export function humanCondition(condition: EngineRuleView['conditionDetails'][number]): string {
  return `${fieldLabel(condition.field)} ${operatorLabel(condition.op)} ${conditionValueLabel(condition.field, condition.value)}`;
}

export function rulesForActivity(rules: EngineRuleView[], activity: EngineEventType): EngineRuleView[] {
  return rules.filter((rule) => rule.activity === activity);
}

export function unscopedRules(rules: EngineRuleView[]): EngineRuleView[] {
  return rules.filter((rule) => rule.activity === null);
}

export function findTransformation(snapshot: EngineSnapshot, id: string | null): EngineRuleView | undefined {
  if (id === null) {
    return undefined;
  }
  return snapshot.rules.find((rule) => rule.displayId === id || rule.id === id);
}

export function usageFor(snapshot: EngineSnapshot, rule: EngineRuleView): {
  transactions: EngineTransactionView[];
  count: number;
  accounted: number;
} {
  const transactions = snapshot.transactions.filter((row) => row.selectedRule === rule.displayId);
  return {
    transactions,
    count: transactions.length,
    accounted: transactions.reduce((sum, row) => sum + row.amount, 0)
  };
}

export function accountsUsing(snapshot: EngineSnapshot, accountCode: string): EngineRuleView[] {
  return snapshot.rules.filter((rule) => rule.lines.some((line) => line.accountCode === accountCode));
}

export type SourceKind = 'canonical' | 'attribute' | 'future';

export type SourceField = {
  id: string;
  label: string;
  kind: SourceKind;
  note: string;
  activities?: EngineEventType[];
};

export const CANONICAL_SOURCES: SourceField[] = [
  { id: 'eventType', label: 'Activity', kind: 'canonical', note: 'Purchase, payment, refund, or usage' },
  { id: 'amount', label: 'Amount', kind: 'canonical', note: 'Taken from the event' },
  { id: 'currency', label: 'Currency', kind: 'canonical', note: 'ISO-4217 code' },
  { id: 'counterparty', label: 'Counterparty', kind: 'canonical', note: 'Merchant or payee' },
  { id: 'occurredAt', label: 'Occurred at', kind: 'canonical', note: 'When the activity happened' },
  { id: 'source', label: 'Origin', kind: 'canonical', note: 'API, document, bank feed, email, CSV, or human input' }
];

export const ATTRIBUTE_SOURCES: SourceField[] = [
  { id: 'attributes.category', label: 'Category', kind: 'attribute', note: 'Used in the live demo pack', activities: ['PURCHASE', 'PAYMENT', 'REFUND', 'USAGE'] },
  { id: 'attributes.meter', label: 'Usage meter', kind: 'attribute', note: 'Usage events', activities: ['USAGE'] },
  { id: 'attributes.quantity', label: 'Quantity', kind: 'attribute', note: 'Usage events', activities: ['USAGE'] },
  { id: 'attributes.unitPrice', label: 'Unit price', kind: 'attribute', note: 'Usage events', activities: ['USAGE'] },
  { id: 'attributes.unit', label: 'Unit', kind: 'attribute', note: 'Usage events', activities: ['USAGE'] }
];

export const FUTURE_SOURCES: SourceField[] = [
  { id: 'department', label: 'Department', kind: 'future', note: 'Usable as an event attribute. Not a dedicated source object yet.' },
  { id: 'project', label: 'Project', kind: 'future', note: 'Usable as an event attribute. Not a dedicated source object yet.' },
  { id: 'paymentMethod', label: 'Payment method', kind: 'future', note: 'Usable as an event attribute. Not a dedicated source object yet.' },
  { id: 'merchantCategory', label: 'Merchant category', kind: 'future', note: 'Usable as an event attribute. Not a dedicated source object yet.' },
  { id: 'location', label: 'Location', kind: 'future', note: 'Usable as an event attribute. Not a dedicated source object yet.' }
];

export function sourcesForActivity(activity: EngineEventType): {
  canonical: SourceField[];
  attributes: SourceField[];
  future: SourceField[];
} {
  return {
    canonical: CANONICAL_SOURCES,
    attributes: ATTRIBUTE_SOURCES.filter((field) => field.activities === undefined || field.activities.includes(activity)),
    future: FUTURE_SOURCES
  };
}

export function treatmentLabel(rule: EngineRuleView): string {
  return rule.lines.map((line) => `${line.side === 'DEBIT' ? 'DR' : 'CR'} ${line.accountName}`).join(' · ');
}

export function transformationHeadline(rule: EngineRuleView): string {
  const counterparty = rule.conditionDetails.find((condition) => condition.field === 'counterparty');
  const amount = rule.conditionDetails.find((condition) => condition.field === 'amount');
  const then = rule.lines.map((line) => line.accountName).join(' / ');
  if (counterparty !== undefined && amount !== undefined) {
    return `${counterparty.value} ${operatorLabel(amount.op)} ${conditionValueLabel('amount', amount.value)} → ${then}`;
  }
  if (counterparty !== undefined) {
    return `${counterparty.value} → ${then}`;
  }
  return `${then}`;
}

export function edgeLabel(rule: EngineRuleView): { from: string; to: string } {
  const counterparty = rule.conditionDetails.find((condition) => condition.field === 'counterparty');
  const from = counterparty === undefined
    ? rule.name
    : (counterparty.op === 'IN' || counterparty.op === 'in'
      ? counterparty.value.split(',')[0]?.trim() ?? rule.name
      : counterparty.value);
  const debit = rule.lines.find((line) => line.side === 'DEBIT');
  const credit = rule.lines.find((line) => line.side === 'CREDIT');
  const to = [debit?.accountName, credit?.accountName].filter((name) => name !== undefined).join(' / ');
  return { from, to };
}

export function overlapStatus(rule: EngineRuleView, rules: readonly EngineRuleView[]): {
  tone: 'ok' | 'warn';
  label: string;
} {
  const peers = rules.filter((candidate) =>
    candidate.enabled
    && candidate.displayId !== rule.displayId
    && candidate.activity === rule.activity
  );
  const samePriority = peers.filter((candidate) => candidate.priority === rule.priority);
  if (samePriority.length > 0) {
    return {
      tone: 'warn',
      label: `Same priority as ${samePriority.map((candidate) => candidate.displayId).join(', ')} — conflict if both match`
    };
  }
  if (peers.length === 0) {
    return { tone: 'ok', label: 'No overlapping transformation' };
  }
  const activity = rule.activity === null ? 'activity' : activitySingular(rule.activity).toLowerCase();
  return {
    tone: 'ok',
    label: `${peers.length} other ${activity} transformation${peers.length === 1 ? '' : 's'} · this wins at priority ${rule.priority}`
  };
}

export function transformationPurpose(rule: EngineRuleView): string {
  const activity = rule.activity === null ? 'activity' : activitySingular(rule.activity).toLowerCase();
  const counterparty = rule.conditionDetails.find((condition) => condition.field === 'counterparty');
  const amount = rule.conditionDetails.find((condition) => condition.field === 'amount');
  if (counterparty !== undefined && amount !== undefined) {
    return `Defines how ${counterparty.value} ${activity}s ${operatorLabel(amount.op)} ${conditionValueLabel('amount', amount.value)} are accounted for.`;
  }
  if (counterparty !== undefined) {
    return `Defines how ${counterparty.value} ${activity} activity is accounted for.`;
  }
  return `Defines how ${activity} activity matching these conditions is accounted for.`;
}

export function dslForRule(dsl: string, name: string): string {
  const blocks = dsl.split(/(?=RULE )/);
  const match = blocks.find((block) => block.includes(`RULE "${name}"`) || block.includes(`RULE ${JSON.stringify(name)}`));
  return (match ?? dsl).trim();
}

export function parseTeachInstruction(
  text: string,
  accounts: Array<{ code: string; name: string }>
): { merchant: string; debitCode?: string; name?: string } | { error: string } {
  const instruction = text.trim();
  if (instruction.length < 4) {
    return { error: 'Describe how you want this accounted, for example “Spotify should go to Software Expense.”' };
  }
  if (/^\s*(why|explain|how come|show me|find\b|search\b|where does)\b/i.test(instruction)) {
    return { error: 'That is a question about the live model, not a new transformation.' };
  }
  const account = accounts.find((row) =>
    instruction.toLowerCase().includes(row.name.toLowerCase()) || instruction.includes(row.code)
  );
  const named = instruction.match(/["']([^"']+)["']/);
  const treat = instruction.match(/^treat\s+(?:all\s+)?(.+?)\s+as\s+/i);
  const created = instruction.match(/^create\s+(?:a\s+)?(?:rule|transformation)\s+for\s+(.+?)(?:[.]|$)/i);
  const change = instruction.match(/^change\s+(.+?)(?:\s+to\s+|\s+so\s+|\s+should\b|\s+accounting\b|$)/i);
  const should = instruction.match(/^(.+?)\s+should\s+(?:go\s+to|be|post\s+to|use)\b/i);
  const rawMerchant = (should?.[1] ?? treat?.[1] ?? created?.[1] ?? change?.[1] ?? named?.[1] ?? '')
    .replace(/^the\s+/i, '')
    .trim();
  const merchant = tidyMerchant(rawMerchant);
  if (merchant.length === 0) {
    return { error: 'Name the merchant or counterparty, for example “Spotify should go to Software Expense.”' };
  }
  return {
    merchant,
    name: `${merchant} ${account?.name ?? 'rule'}`,
    ...(account !== undefined ? { debitCode: account.code } : {})
  };
}

export type ProposedCondition = {
  field: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN';
  value: string | number;
};

export type ProposedLine = {
  side: 'DEBIT' | 'CREDIT';
  accountCode: string | null;
  accountName: string;
  exists: boolean;
  suggestedType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  amountType?: 'EVENT_AMOUNT' | 'FIXED_AMOUNT' | 'ATTRIBUTE_AMOUNT' | 'RATE_AMOUNT';
  rate?: number;
  description?: string;
};

export type ProposedTransactionalEffect = {
  type: 'WALLET_LOAD' | 'WALLET_SPEND' | 'SALE' | 'FEE' | 'TAX' | 'COMMISSION' | 'WITHHOLDING' | 'ADJUSTMENT' | 'PAYOUT';
  direction: 'CREDIT' | 'DEBIT';
  amount: { type: 'EVENT_AMOUNT' } | { type: 'FIXED'; value: number } | { type: 'RATE'; rate: number };
  description: string;
};

export type ProposedTransactional = {
  participantKind: 'BUYER' | 'SELLER';
  participantField: string;
  effects: ProposedTransactionalEffect[];
};

export type AccountingProposal = {
  instruction: string;
  name: string;
  activity: EngineEventType;
  conditions: ProposedCondition[];
  lines: ProposedLine[];
  transactional?: ProposedTransactional;
};

export function proposeAccounting(
  text: string,
  accounts: Array<{ code: string; name: string; type?: string }>
): AccountingProposal | { error: string } {
  const instruction = text.trim();
  if (instruction.length < 4) {
    return { error: 'Describe how you want this accounted, for example “Mark all Starbucks expenses > ₹5,000 as Business Meals.”' };
  }
  if (/^\s*(why|explain|how come|show me|find\b|search\b|where does)\b/i.test(instruction)) {
    return { error: 'That is a question about the live model, not a new transformation.' };
  }
  if (isSellerIntent(instruction)) {
    return proposeSellerAccounting(instruction, accounts);
  }
  if (isWalletIntent(instruction)) {
    return proposeWalletAccounting(instruction, accounts);
  }

  const named = instruction.match(/["']([^"']+)["']/);
  const mark = instruction.match(/^mark\s+(?:all\s+)?(.+?)\s+as\s+(.+)$/i);
  const treat = instruction.match(/^treat\s+(?:all\s+)?(.+?)\s+as\s+(.+)$/i);
  const charged = instruction.match(/^(.+?)\s+should\s+be\s+charged\s+to\s+(.+)$/i);
  const goes = instruction.match(/^(.+?)\s+goes\s+to\s+(.+)$/i);
  const should = instruction.match(/^(.+?)\s+should\s+(?:go\s+to|be|post\s+to|use)\s+(.+)$/i);
  const created = instruction.match(/^create\s+(?:a\s+)?(?:rule|transformation)\s+for\s+(.+?)(?:[.]|$)/i);
  const change = instruction.match(/^change\s+(.+?)(?:\s+to\s+|\s+so\s+|\s+should\b|\s+accounting\b|$)/i);

  const subject = (mark?.[1] ?? treat?.[1] ?? charged?.[1] ?? goes?.[1] ?? should?.[1] ?? created?.[1] ?? change?.[1] ?? named?.[1] ?? instruction).replace(/^the\s+/i, '').trim();
  const accountPhrase = (mark?.[2] ?? treat?.[2] ?? charged?.[2] ?? goes?.[2] ?? should?.[2] ?? '').replace(/\s+instead of\s+.+$/i, '').replace(/\s+paid by\s+.+$/i, '').replace(/\s+against\s+.+$/i, '').trim();

  const merchant = tidyMerchant(subject);
  if (merchant.length === 0) {
    return { error: 'Name the merchant or counterparty, for example “Mark all Starbucks expenses > ₹5,000 as Business Meals.”' };
  }

  const activity = inferActivity(instruction);
  const amount = parseAmountThreshold(instruction);
  const debit = accountPhrase.length > 0
    ? resolveAccountMention(accountPhrase, accounts, 'DEBIT')
    : null;
  const creditMention = instruction.match(/\b(?:paid by|against|credit(?:ing)?)\s+(.+)$/i);
  const credited = creditMention === null ? null : resolveAccountMention(creditMention[1] ?? '', accounts, 'CREDIT');
  const credit = credited ?? defaultCredit(activity, accounts);

  const conditions: ProposedCondition[] = [
    { field: 'eventType', op: '=', value: activity }
  ];
  if (merchant.length > 0) {
    conditions.push({ field: 'counterparty', op: '=', value: merchant });
  }
  if (amount !== null) {
    conditions.push({ field: 'amount', op: amount.op, value: amount.value });
  }

  const debitLine: ProposedLine = debit ?? {
    side: 'DEBIT',
    accountCode: findAccount(accounts, 'Unknown Expense')?.code ?? '5000',
    accountName: findAccount(accounts, 'Unknown Expense')?.name ?? 'Unknown Expense',
    exists: findAccount(accounts, 'Unknown Expense') !== undefined,
    suggestedType: 'EXPENSE'
  };
  const creditLine: ProposedLine = credit;

  return {
    instruction,
    name: `${merchant} ${debitLine.accountName}`.replace(/\s+Expense$/i, '').trim() || `${merchant} rule`,
    activity,
    conditions,
    lines: [debitLine, creditLine]
  };
}

function inferActivity(text: string): EngineEventType {
  if (/\b(refunds?|refunded)\b/i.test(text)) {
    return 'REFUND';
  }
  if (/\b(usage|infrastructure|meter|compute|storage)\b/i.test(text)) {
    return 'USAGE';
  }
  if (/\bmarketplace sale|\bseller payout|\bsellers?\b/i.test(text)) {
    return 'MARKETPLACE_SALE';
  }
  if (/\bwallet load|\bloads? money\b/i.test(text)) {
    return 'WALLET_LOAD';
  }
  if (/\bwallet (spend|purchase)|spends? money\b/i.test(text)) {
    return 'WALLET_SPEND';
  }
  if (/\b(fees?|payments?|bank)\b/i.test(text)) {
    return 'PAYMENT';
  }
  return 'PURCHASE';
}

function isSellerIntent(text: string): boolean {
  return /\bsellers?\b/i.test(text)
    && /\b(owed|payout|marketplace|fee|tax|sale)\b/i.test(text);
}

function isWalletIntent(text: string): boolean {
  return /\bwallet\b/i.test(text) || /\bbuyer(s)? (wallet|balances|loads?|spends?)\b/i.test(text);
}

function parsePercents(text: string): { fee: number; tax: number } {
  const percents = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) => Number(match[1]) / 100);
  const feeMention = text.match(/(\d+(?:\.\d+)?)\s*%[^%]{0,40}fee|fee[^%]{0,40}(\d+(?:\.\d+)?)\s*%/i);
  const taxMention = text.match(/(\d+(?:\.\d+)?)\s*%[^%]{0,40}tax|tax[^%]{0,40}(\d+(?:\.\d+)?)\s*%/i);
  const fee = feeMention !== null
    ? Number(feeMention[1] ?? feeMention[2]) / 100
    : (percents[0] ?? 0.05);
  const tax = taxMention !== null
    ? Number(taxMention[1] ?? taxMention[2]) / 100
    : (percents[1] ?? (percents[0] !== undefined && percents.length === 1 ? 0.09 : 0.09));
  return { fee, tax };
}

function accountLine(
  accounts: Array<{ code: string; name: string; type?: string }>,
  side: 'DEBIT' | 'CREDIT',
  name: string,
  extra?: Partial<ProposedLine>
): ProposedLine {
  const found = findAccount(accounts, name);
  return {
    side,
    accountCode: found?.code ?? null,
    accountName: found?.name ?? name,
    exists: found !== undefined,
    suggestedType: (found?.type as ProposedLine['suggestedType'] | undefined) ?? guessAccountType(name),
    amountType: 'EVENT_AMOUNT',
    ...extra
  };
}

function proposeSellerAccounting(
  instruction: string,
  accounts: Array<{ code: string; name: string; type?: string }>
): AccountingProposal {
  const payoutOnly = /\bpayout\b/i.test(instruction) && !/\bsale|sold|marketplace sale\b/i.test(instruction);
  if (payoutOnly) {
    return {
      instruction,
      name: 'Seller Payout',
      activity: 'SELLER_PAYOUT',
      conditions: [{ field: 'eventType', op: '=', value: 'SELLER_PAYOUT' }],
      lines: [
        accountLine(accounts, 'DEBIT', 'Seller Payable'),
        accountLine(accounts, 'CREDIT', 'Cash')
      ],
      transactional: {
        participantKind: 'SELLER',
        participantField: 'attributes.sellerId',
        effects: [
          { type: 'PAYOUT', direction: 'DEBIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Payout' }
        ]
      }
    };
  }
  const rates = parsePercents(instruction);
  const feeRate = rates.fee;
  const taxRate = /\btax\b/i.test(instruction) ? rates.tax : 0.09;
  const effects: ProposedTransactionalEffect[] = [
    { type: 'SALE', direction: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Gross sale' },
    { type: 'FEE', direction: 'DEBIT', amount: { type: 'RATE', rate: feeRate }, description: 'Marketplace fee' }
  ];
  if (/\btax\b/i.test(instruction) || taxRate > 0) {
    effects.push({ type: 'TAX', direction: 'DEBIT', amount: { type: 'RATE', rate: taxRate }, description: 'Tax' });
  }
  return {
    instruction,
    name: 'Marketplace Sale',
    activity: 'MARKETPLACE_SALE',
    conditions: [{ field: 'eventType', op: '=', value: 'MARKETPLACE_SALE' }],
    lines: [
      accountLine(accounts, 'DEBIT', 'Cash', { description: 'Cash' }),
      accountLine(accounts, 'CREDIT', 'Seller Payable', { description: 'Seller Payable' }),
      accountLine(accounts, 'DEBIT', 'Seller Payable', { amountType: 'RATE_AMOUNT', rate: feeRate, description: 'Marketplace fee' }),
      accountLine(accounts, 'CREDIT', 'Marketplace Fee Revenue', { amountType: 'RATE_AMOUNT', rate: feeRate, description: 'Marketplace Fee Revenue' }),
      accountLine(accounts, 'DEBIT', 'Seller Payable', { amountType: 'RATE_AMOUNT', rate: taxRate, description: 'Tax' }),
      accountLine(accounts, 'CREDIT', 'Tax Payable', { amountType: 'RATE_AMOUNT', rate: taxRate, description: 'Tax Payable' })
    ],
    transactional: {
      participantKind: 'SELLER',
      participantField: 'attributes.sellerId',
      effects
    }
  };
}

function proposeWalletAccounting(
  instruction: string,
  accounts: Array<{ code: string; name: string; type?: string }>
): AccountingProposal {
  const spend = /\bspend|decrease|purchase\b/i.test(instruction) && !/\bload|increase\b/i.test(instruction);
  if (spend) {
    return {
      instruction,
      name: 'Wallet Spend',
      activity: 'WALLET_SPEND',
      conditions: [{ field: 'eventType', op: '=', value: 'WALLET_SPEND' }],
      lines: [
        accountLine(accounts, 'DEBIT', 'Buyer Wallet'),
        accountLine(accounts, 'CREDIT', 'Cash')
      ],
      transactional: {
        participantKind: 'BUYER',
        participantField: 'attributes.buyerId',
        effects: [
          { type: 'WALLET_SPEND', direction: 'DEBIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Purchase' }
        ]
      }
    };
  }
  return {
    instruction,
    name: 'Wallet Load',
    activity: 'WALLET_LOAD',
    conditions: [{ field: 'eventType', op: '=', value: 'WALLET_LOAD' }],
    lines: [
      accountLine(accounts, 'DEBIT', 'Cash'),
      accountLine(accounts, 'CREDIT', 'Buyer Wallet')
    ],
    transactional: {
      participantKind: 'BUYER',
      participantField: 'attributes.buyerId',
      effects: [
        { type: 'WALLET_LOAD', direction: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Wallet Load' }
      ]
    }
  };
}

function parseAmountThreshold(text: string): { op: '>' | '>=' | '<' | '<='; value: number } | null {
  const match = text.match(/(>=|<=|>|<|at least|over|greater than|less than)\s*₹?\s*([\d,]+(?:\.\d+)?)/i);
  if (match === null) {
    return null;
  }
  const value = Number((match[2] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(value)) {
    return null;
  }
  const token = (match[1] ?? '>').toLowerCase();
  const op: '>' | '>=' | '<' | '<=' = token === '>=' || token === 'at least'
    ? '>='
    : token === '<=' || token === 'less than'
      ? token === 'less than' ? '<' : '<='
      : token === '<' ? '<' : '>';
  return { op, value };
}

function findAccount(
  accounts: Array<{ code: string; name: string; type?: string }>,
  phrase: string
): { code: string; name: string; type?: string } | undefined {
  const needle = phrase.trim().toLowerCase();
  if (needle.length === 0) {
    return undefined;
  }
  const ranked = [...accounts].sort((left, right) => right.name.length - left.name.length);
  return ranked.find((row) =>
    needle === row.name.toLowerCase()
    || needle === row.code.toLowerCase()
    || row.name.toLowerCase() === needle
    || needle.startsWith(row.name.toLowerCase())
    || row.name.toLowerCase().startsWith(needle)
    || needle.includes(row.name.toLowerCase())
    || row.name.toLowerCase().includes(needle)
  );
}

function guessAccountType(name: string): ProposedLine['suggestedType'] {
  if (/\b(cash|bank|receivable)\b/i.test(name)) {
    return 'ASSET';
  }
  if (/\b(card|payable|liability)\b/i.test(name)) {
    return 'LIABILITY';
  }
  if (/\b(income|revenue)\b/i.test(name)) {
    return 'INCOME';
  }
  if (/\b(equity|capital)\b/i.test(name)) {
    return 'EQUITY';
  }
  return 'EXPENSE';
}

function resolveAccountMention(
  phrase: string,
  accounts: Array<{ code: string; name: string; type?: string }>,
  side: 'DEBIT' | 'CREDIT'
): ProposedLine | null {
  const cleaned = phrase.replace(/[.].*$/, '').replace(/\s+paid by\s+.+$/i, '').trim();
  if (cleaned.length === 0) {
    return null;
  }
  const found = findAccount(accounts, cleaned);
  if (found !== undefined) {
    return {
      side,
      accountCode: found.code,
      accountName: found.name,
      exists: true,
      suggestedType: (found.type as ProposedLine['suggestedType'] | undefined) ?? guessAccountType(found.name)
    };
  }
  const name = cleaned.split(/\s+(?:and|paid|against)\b/i)[0]?.trim() ?? cleaned;
  if (name.length < 3) {
    return null;
  }
  return {
    side,
    accountCode: null,
    accountName: name,
    exists: false,
    suggestedType: guessAccountType(name)
  };
}

function defaultCredit(
  activity: EngineEventType,
  accounts: Array<{ code: string; name: string; type?: string }>
): ProposedLine {
  const prefer = activity === 'USAGE'
    ? ['Accounts Payable', '2100']
    : activity === 'PAYMENT' || activity === 'REFUND'
      ? ['Cash', '1010']
      : ['Corporate Card', '2000'];
  for (const token of prefer) {
    const found = findAccount(accounts, token);
    if (found !== undefined) {
      return {
        side: 'CREDIT',
        accountCode: found.code,
        accountName: found.name,
        exists: true,
        suggestedType: (found.type as ProposedLine['suggestedType'] | undefined) ?? 'LIABILITY'
      };
    }
  }
  return {
    side: 'CREDIT',
    accountCode: prefer[1] ?? '2000',
    accountName: prefer[0] ?? 'Corporate Card',
    exists: false,
    suggestedType: 'LIABILITY'
  };
}

export function proposalReady(proposal: AccountingProposal): boolean {
  return proposal.lines.length >= 2 && proposal.lines.every((line) => line.exists && line.accountCode !== null);
}

export function suggestAccountCode(
  type: ProposedLine['suggestedType'],
  used: Iterable<string>
): string {
  const taken = new Set(used);
  let code = type === 'ASSET' ? 1010 : type === 'LIABILITY' ? 2000 : type === 'EQUITY' ? 3000 : type === 'INCOME' ? 4000 : 5200;
  while (taken.has(String(code))) {
    code += 10;
  }
  return String(code);
}

function tidyMerchant(raw: string): string {
  return raw
    .replace(/\s+(rides?|purchases?|payments?|refunds?|usage|transactions?|activity|charges?|expenses?|fees?|infrastructure)\b.*$/i, '')
    .replace(/\s+over\s+.+$/i, '')
    .replace(/\s+paid by\s+.+$/i, '')
    .trim();
}

export const ASK_EXAMPLES: Array<{ chip: string; prompt: string }> = [
  { chip: 'Starbucks meals', prompt: 'Mark all Starbucks expenses > ₹5,000 as Business Meals' },
  { chip: 'Buyer wallets', prompt: 'Track wallet balances for every buyer. When a buyer loads money, increase their wallet.' },
  { chip: 'Seller payouts', prompt: 'Track what each seller is owed from marketplace sales. Deduct a 5% marketplace fee and 18% tax before showing the seller\'s eligible payout.' }
];

export type StudioRecentWork = {
  transformationId: string;
  title: string;
  detail: string;
  at: number;
};

export type StudioAttentionItem = {
  id: string;
  tone: 'warn' | 'info';
  title: string;
  detail: string;
  pane: StudioPane;
  activity?: EngineEventType;
  transformationId?: string;
};

export type StudioSearchHit = {
  id: string;
  kind: 'ask' | 'transformation' | 'activity' | 'account' | 'source' | 'version';
  title: string;
  subtitle: string;
  pane: StudioPane;
  activity?: EngineEventType;
  transformationId?: string;
  accountCode?: string;
  ask?: string;
};

export type StudioIntent =
  | { kind: 'teach' }
  | { kind: 'explain'; transformationId: string | null; eventId: string | null; summary: string }
  | { kind: 'search'; query: string }
  | { kind: 'navigate'; pane: StudioPane; activity?: EngineEventType };

export type ActivitySummary = {
  type: EngineEventType;
  label: string;
  transformations: number;
  accounts: number;
};

const SEARCH_STOP = new Set([
  'show', 'me', 'everything', 'that', 'accounts', 'for', 'where', 'does', 'get', 'the', 'a', 'an',
  'to', 'in', 'of', 'is', 'are', 'using', 'use', 'find', 'search', 'all', 'and', 'or', 'my', 'your',
  'this', 'those', 'these', 'what', 'which', 'who', 'please', 'about', 'how', 'should', 'be', 'been',
  'being', 'posted', 'post', 'go', 'going', 'went', 'with', 'from', 'into', 'on'
]);

const SEARCH_MODIFIERS = new Set(['credited', 'credit', 'debited', 'debit']);

export function activitySummaries(snapshot: EngineSnapshot): ActivitySummary[] {
  return STUDIO_ACTIVITIES.map((type) => {
    const rules = rulesForActivity(snapshot.rules, type);
    const accounts = new Set(rules.flatMap((rule) => rule.lines.map((line) => line.accountCode)));
    return {
      type,
      label: activityLabel(type),
      transformations: rules.length,
      accounts: accounts.size
    };
  });
}

export function conflictGroups(rules: readonly EngineRuleView[]): Array<{
  activity: EngineEventType | null;
  priority: number;
  rules: EngineRuleView[];
}> {
  const enabled = rules.filter((rule) => rule.enabled);
  const keys = new Map<string, EngineRuleView[]>();
  for (const rule of enabled) {
    const key = `${rule.activity ?? 'none'}:${rule.priority}`;
    const group = keys.get(key) ?? [];
    group.push(rule);
    keys.set(key, group);
  }
  return [...keys.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      activity: group[0]?.activity ?? null,
      priority: group[0]?.priority ?? 0,
      rules: group
    }));
}

export function attentionQueue(snapshot: EngineSnapshot): StudioAttentionItem[] {
  const items: StudioAttentionItem[] = [];
  if (snapshot.policy === null) {
    items.push({
      id: 'policy-missing',
      tone: 'warn',
      title: 'No live accounting policy',
      detail: 'Compile at least one transformation to activate a policy.',
      pane: 'versions'
    });
  }
  const conflicts = conflictGroups(snapshot.rules);
  const conflictsByActivity = new Map<string, EngineRuleView[]>();
  for (const group of conflicts) {
    const key = group.activity ?? 'unscoped';
    const existing = conflictsByActivity.get(key) ?? [];
    conflictsByActivity.set(key, existing.concat(group.rules));
  }
  for (const [key, rules] of conflictsByActivity) {
    const activity = rules[0]?.activity ?? null;
    const unique = [...new Map(rules.map((rule) => [rule.displayId, rule])).values()];
    const label = activity === null ? 'unscoped' : activityLabel(activity).toLowerCase();
    items.push({
      id: `conflict-${key}`,
      tone: 'warn',
      title: `${unique.length} overlapping ${label} transformation${unique.length === 1 ? '' : 's'}`,
      detail: `Same priority — review before a transaction can match more than one.`,
      pane: activity === null ? 'transformations' : 'activities',
      activity: activity ?? undefined,
      transformationId: unique[0]?.displayId
    });
  }
  if (snapshot.lastResult?.evaluation.reason === 'POLICY_INVALID_CONFLICTING_RULES' && conflicts.length === 0) {
    items.push({
      id: 'run-conflict',
      tone: 'warn',
      title: 'Last run hit a transformation conflict',
      detail: 'Open the activity and check overlapping priorities.',
      pane: 'transformations'
    });
  }
  const unmatched = snapshot.transactions.filter((row) => row.accountingStatus === 'NOT_ACCOUNTED' || row.pipeline.unmatched);
  if (unmatched.length > 0) {
    items.push({
      id: 'unmatched',
      tone: 'warn',
      title: `${unmatched.length} unmatched transaction${unmatched.length === 1 ? '' : 's'}`,
      detail: 'No transformation selected them. Teach Kanakku or review catch-alls.',
      pane: 'transformations'
    });
  }
  const failed = snapshot.transactions.filter((row) => row.accountingStatus === 'FAILED' || row.pipeline.failed);
  if (failed.length > 0) {
    items.push({
      id: 'failed',
      tone: 'warn',
      title: `${failed.length} failed transaction${failed.length === 1 ? '' : 's'}`,
      detail: 'The engine could not post. Review the transformation and accounts.',
      pane: 'transformations'
    });
  }
  const sim = snapshot.lastSimulation;
  if (sim !== null) {
    const name = sim.intendedRuleDisplayId === null
      ? 'the last simulation'
      : `${sim.intendedRuleDisplayId}${sim.selectedRuleName === null ? '' : ` ${sim.selectedRuleName}`}`;
    items.push({
      id: 'simulation',
      tone: 'info',
      title: sim.wouldPost ? 'Simulation ready' : 'Simulation needs review',
      detail: sim.wouldPost ? `Review ${name} — it would post, and did not.` : `Review ${name} — it would not post.`,
      pane: 'transformations',
      transformationId: sim.intendedRuleDisplayId ?? sim.selectedRuleDisplayId ?? undefined
    });
  }
  const off = snapshot.rules.filter((rule) => !rule.enabled);
  if (off.length > 0) {
    items.push({
      id: 'disabled',
      tone: 'info',
      title: `${off.length} transformation${off.length === 1 ? '' : 's'} off`,
      detail: 'Not included in the live policy.',
      pane: 'transformations',
      transformationId: off[0]?.displayId
    });
  }
  return items.slice(0, 5);
}

export function relativeWorkedLabel(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) {
    return 'Just now';
  }
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (seconds < 86400) {
    const hours = Math.max(1, Math.round(seconds / 3600));
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (seconds < 172800) {
    return 'Yesterday';
  }
  const days = Math.round(seconds / 86400);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export function matchesTransformation(rule: EngineRuleView, query: string): boolean {
  const needle = normalizeSearch(query);
  if (needle.length === 0) {
    return true;
  }
  const hay = normalizeSearch([
    rule.displayId,
    rule.name,
    matchSummary(rule),
    treatmentLabel(rule),
    rule.activity ?? '',
    rule.activity === null ? 'unscoped' : `${activityLabel(rule.activity)} ${activitySingular(rule.activity)}`,
    rule.enabled ? 'active' : 'off',
    ...rule.conditionDetails.map((condition) => humanCondition(condition)),
    ...rule.lines.map((line) => `${line.accountCode} ${line.accountName} ${line.side}`)
  ].join(' '));
  if (hay.includes(needle)) {
    return true;
  }
  const tokens = needle.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/[₹,]/g, '').replace(/\s+/g, ' ').trim();
}

function compactOperator(op: string): string {
  if (op === '=' || op === 'equals') {
    return '';
  }
  if (op === '!=' || op === 'not_equals') {
    return '≠';
  }
  if (op === '>' || op === 'greater_than') {
    return '>';
  }
  if (op === '>=' || op === 'greater_than_or_equal') {
    return '≥';
  }
  if (op === '<' || op === 'less_than') {
    return '<';
  }
  if (op === '<=' || op === 'less_than_or_equal') {
    return '≤';
  }
  return '';
}

export function matchSummary(rule: EngineRuleView): string {
  const extras = rule.conditionDetails.filter((condition) => condition.field !== 'eventType' && condition.field !== 'type');
  const activity = rule.activity === null ? 'Unscoped' : activitySingular(rule.activity);
  if (extras.length === 0) {
    return `${activity} · any`;
  }
  const bits = extras.map((condition) => {
    if (condition.field === 'counterparty') {
      const names = (condition.op === 'IN' || condition.op === 'in')
        ? condition.value.split(',').map((part) => part.trim()).join(', ')
        : condition.value;
      const op = compactOperator(condition.op);
      return op.length === 0 ? names : `Counterparty ${op} ${names}`;
    }
    if (condition.field === 'amount') {
      const op = compactOperator(condition.op);
      return `Amount ${op} ${conditionValueLabel('amount', condition.value)}`.replace(/\s+/g, ' ');
    }
    return humanCondition(condition);
  });
  return [activity, ...bits].join(' · ');
}

export function isFallbackTransformation(rule: EngineRuleView, rules: readonly EngineRuleView[]): boolean {
  const extras = rule.conditionDetails.filter((condition) => condition.field !== 'eventType' && condition.field !== 'type');
  if (extras.length > 0 || rule.activity === null) {
    return false;
  }
  const peers = rules.filter((candidate) => candidate.activity === rule.activity && candidate.enabled);
  if (peers.length === 0) {
    return true;
  }
  const lowest = Math.min(...peers.map((candidate) => candidate.priority));
  return rule.priority === lowest;
}

export type TransformationIndexFilter = {
  query: string;
  activity: EngineEventType | 'ALL' | 'UNSCOPED';
  status: 'ALL' | 'ACTIVE' | 'OFF';
  account: string | 'ALL';
  conflictsOnly: boolean;
  usageOnly: boolean;
};

export function filterIndexTransformations(
  snapshot: EngineSnapshot,
  filter: TransformationIndexFilter
): EngineRuleView[] {
  const conflicts = new Set(
    conflictGroups(snapshot.rules).flatMap((group) => group.rules.map((rule) => rule.displayId))
  );
  return snapshot.rules.filter((rule) => {
    if (!matchesTransformation(rule, filter.query)) {
      return false;
    }
    if (filter.activity === 'UNSCOPED' && rule.activity !== null) {
      return false;
    }
    if (filter.activity !== 'ALL' && filter.activity !== 'UNSCOPED' && rule.activity !== filter.activity) {
      return false;
    }
    if (filter.status === 'ACTIVE' && !rule.enabled) {
      return false;
    }
    if (filter.status === 'OFF' && rule.enabled) {
      return false;
    }
    if (filter.account !== 'ALL' && !rule.lines.some((line) => line.accountCode === filter.account || line.accountName === filter.account)) {
      return false;
    }
    if (filter.conflictsOnly && !conflicts.has(rule.displayId)) {
      return false;
    }
    if (filter.usageOnly && usageFor(snapshot, rule).count === 0) {
      return false;
    }
    return true;
  });
}

export function groupIndexTransformations(rules: EngineRuleView[]): Array<{
  key: string;
  activity: EngineEventType | null;
  label: string;
  rules: EngineRuleView[];
}> {
  const groups: Array<{ key: string; activity: EngineEventType | null; label: string; rules: EngineRuleView[] }> = STUDIO_ACTIVITIES.map((type) => ({
    key: type,
    activity: type,
    label: activityLabel(type),
    rules: rules.filter((rule) => rule.activity === type).slice().sort((a, b) => b.priority - a.priority)
  })).filter((group) => group.rules.length > 0);
  const leftover = rules.filter((rule) => rule.activity === null).slice().sort((a, b) => b.priority - a.priority);
  if (leftover.length > 0) {
    groups.push({
      key: 'unscoped',
      activity: null,
      label: 'Unscoped',
      rules: leftover
    });
  }
  return groups;
}

export function indexConflict(rule: EngineRuleView, rules: readonly EngineRuleView[]): {
  tone: 'ok' | 'warn';
  label: string;
  detail: string;
  peers: EngineRuleView[];
} {
  const group = conflictGroups(rules).find((candidate) => candidate.rules.some((row) => row.displayId === rule.displayId));
  if (group === undefined) {
    return {
      tone: 'ok',
      label: 'No conflict',
      detail: overlapStatus(rule, rules).label,
      peers: []
    };
  }
  const peers = group.rules.filter((row) => row.displayId !== rule.displayId);
  return {
    tone: 'warn',
    label: `overlaps ${peers.length} transformation${peers.length === 1 ? '' : 's'}`,
    detail: overlapStatus(rule, rules).label,
    peers
  };
}

export function classifyStudioIntent(text: string, snapshot: EngineSnapshot): StudioIntent {
  const query = text.trim();
  if (query.length === 0) {
    return { kind: 'search', query: '' };
  }
  const nav = query.match(/^(?:go to|open|show)\s+(home|overview|activities|sources|transformations|accounts|versions)\b/i);
  if (nav !== null) {
    const target = nav[1]?.toLowerCase() ?? 'home';
    const pane: StudioPane = target === 'home' || target === 'overview' ? 'overview' : target as StudioPane;
    return { kind: 'navigate', pane };
  }
  const explore = query.match(/^(?:explore|open|show)\s+(purchases?|payments?|refunds?|usage)\b/i);
  if (explore !== null) {
    const word = explore[1]?.toLowerCase() ?? 'purchases';
    const activity: EngineEventType = word.startsWith('pay')
      ? 'PAYMENT'
      : word.startsWith('ref')
        ? 'REFUND'
        : word.startsWith('us')
          ? 'USAGE'
          : 'PURCHASE';
    return { kind: 'navigate', pane: 'activities', activity };
  }
  if (/^\s*(why|explain|how come)\b/i.test(query) || /\bwhy (did|is|was|does|do)\b/i.test(query)) {
    return explainAccounting(query, snapshot);
  }
  if (/^(show me|find\b|search\b|where does|everything that|list\b)\b/i.test(query)) {
    return { kind: 'search', query };
  }
  const parsed = parseTeachInstruction(query, snapshot.accounts);
  if (!('error' in parsed)) {
    return { kind: 'teach' };
  }
  if (/^(mark|treat|create|change|make|account|teach|track)\b/i.test(query) || /\b(goes to|charged to|should go to|post to|eligible payout|wallet balances)\b/i.test(query)) {
    return { kind: 'teach' };
  }
  return { kind: 'search', query };
}

function explainAccounting(query: string, snapshot: EngineSnapshot): StudioIntent {
  const lower = query.toLowerCase();
  const namedRule = snapshot.rules.find((rule) =>
    lower.includes(rule.name.toLowerCase()) || lower.includes(rule.displayId.toLowerCase())
  );
  if (namedRule !== undefined) {
    const tx = snapshot.transactions.find((row) => row.selectedRule === namedRule.displayId);
    return {
      kind: 'explain',
      transformationId: namedRule.displayId,
      eventId: tx?.eventId ?? snapshot.lastResult?.eventId ?? null,
      summary: `${namedRule.displayId} ${namedRule.name}`
    };
  }
  const account = snapshot.accounts.find((row) =>
    lower.includes(row.name.toLowerCase()) || lower.includes(row.code.toLowerCase())
  );
  const last = snapshot.lastResult;
  if (account !== undefined && last !== null) {
    const used = last.journal?.lines.some((line) => line.accountCode === account.code) === true
      || last.evaluation.selectedRule?.lines.some((line) => line.accountCode === account.code) === true;
    if (used) {
      return {
        kind: 'explain',
        transformationId: last.evaluation.selectedRule?.displayId ?? null,
        eventId: last.eventId,
        summary: `${last.merchant} posted to ${account.name}`
      };
    }
  }
  if (account !== undefined) {
    const tx = snapshot.transactions.find((row) => row.accountCodes.includes(account.code));
    const rule = snapshot.rules.find((candidate) => candidate.lines.some((line) => line.accountCode === account.code));
    return {
      kind: 'explain',
      transformationId: tx?.selectedRule ?? rule?.displayId ?? null,
      eventId: tx?.eventId ?? null,
      summary: `Accounting that uses ${account.name}`
    };
  }
  const merchantRule = snapshot.rules.find((rule) =>
    rule.conditionDetails.some((condition) =>
      condition.field === 'counterparty' && lower.includes(condition.value.toLowerCase())
    )
  );
  if (merchantRule !== undefined) {
    const tx = snapshot.transactions.find((row) => row.selectedRule === merchantRule.displayId);
    return {
      kind: 'explain',
      transformationId: merchantRule.displayId,
      eventId: tx?.eventId ?? null,
      summary: merchantRule.name
    };
  }
  return {
    kind: 'explain',
    transformationId: null,
    eventId: null,
    summary: 'No matching transformation'
  };
}

export function searchStudioModel(snapshot: EngineSnapshot, query: string): StudioSearchHit[] {
  const trimmed = query.trim();
  const hits: StudioSearchHit[] = [];
  if (trimmed.length >= 4) {
    const intent = classifyStudioIntent(trimmed, snapshot);
    if (intent.kind === 'teach') {
      hits.push({
        id: 'ask',
        kind: 'ask',
        title: 'Ask Kanakku',
        subtitle: trimmed,
        pane: 'overview',
        ask: trimmed
      });
    }
  }
  const { terms, modifiers } = searchTerms(trimmed);
  const needles = terms.length > 0 ? terms : (trimmed.length === 0 ? [] : [trimmed.toLowerCase()]);

  for (const type of STUDIO_ACTIVITIES) {
    const summary = activityLabel(type);
    if (trimmed.length === 0 || matchesNeedles(`${type} ${summary}`, needles)) {
      const count = rulesForActivity(snapshot.rules, type).length;
      hits.push({
        id: `activity-${type}`,
        kind: 'activity',
        title: summary,
        subtitle: `${count} transformation${count === 1 ? '' : 's'}`,
        pane: 'activities',
        activity: type
      });
    }
  }

  for (const rule of snapshot.rules) {
    const hay = [
      rule.displayId,
      rule.name,
      treatmentLabel(rule),
      rule.activity ?? '',
      ...rule.conditionDetails.map((condition) => condition.value),
      ...rule.lines.map((line) => `${line.accountCode} ${line.accountName} ${line.side}`)
    ].join(' ').toLowerCase();
    if (trimmed.length > 0 && !matchesNeedles(hay, needles)) {
      continue;
    }
    if (trimmed.length === 0) {
      continue;
    }
    const creditBoost = modifiers.has('credited') || modifiers.has('credit')
      ? rule.lines.some((line) => line.side === 'CREDIT' && matchesNeedles(`${line.accountName} ${line.accountCode}`, needles))
      : false;
    const debitBoost = modifiers.has('debited') || modifiers.has('debit')
      ? rule.lines.some((line) => line.side === 'DEBIT' && matchesNeedles(`${line.accountName} ${line.accountCode}`, needles))
      : false;
    hits.push({
      id: `rule-${rule.displayId}`,
      kind: 'transformation',
      title: `${rule.displayId} ${rule.name}`,
      subtitle: treatmentLabel(rule),
      pane: 'transformations',
      transformationId: rule.displayId,
      activity: rule.activity ?? undefined
    });
    if (creditBoost || debitBoost) {
      const last = hits[hits.length - 1];
      if (last !== undefined) {
        last.subtitle = `${creditBoost ? 'Credits' : 'Debits'} · ${last.subtitle}`;
      }
    }
  }

  for (const account of snapshot.accountBalances) {
    const hay = `${account.code} ${account.name}`;
    if (trimmed.length === 0 || !matchesNeedles(hay, needles)) {
      continue;
    }
    const used = accountsUsing(snapshot, account.code).length;
    hits.push({
      id: `account-${account.code}`,
      kind: 'account',
      title: account.name,
      subtitle: `${account.code} · ${used} transformation${used === 1 ? '' : 's'}`,
      pane: 'accounts',
      accountCode: account.code
    });
  }

  const sources = [...CANONICAL_SOURCES, ...ATTRIBUTE_SOURCES, ...FUTURE_SOURCES];
  for (const field of sources) {
    if (trimmed.length === 0 || !matchesNeedles(`${field.id} ${field.label} ${field.note}`, needles)) {
      continue;
    }
    hits.push({
      id: `source-${field.id}`,
      kind: 'source',
      title: field.label,
      subtitle: field.note,
      pane: 'sources'
    });
  }

  const policy = snapshot.policy;
  if (policy !== null && (trimmed.length === 0 || matchesNeedles(`${policy.name} version ${policy.version} policy`, needles) || /version/i.test(trimmed))) {
    hits.push({
      id: 'version-live',
      kind: 'version',
      title: policy.name,
      subtitle: `Version ${policy.version} · Active`,
      pane: 'versions'
    });
  }

  if (trimmed.length === 0) {
    return [
      ...STUDIO_ACTIVITIES.map((type) => ({
        id: `activity-${type}`,
        kind: 'activity' as const,
        title: activityLabel(type),
        subtitle: 'Explore this activity',
        pane: 'activities' as const,
        activity: type
      })),
      {
        id: 'nav-transformations',
        kind: 'transformation' as const,
        title: 'Transformations',
        subtitle: 'How activity is accounted',
        pane: 'transformations' as const
      },
      {
        id: 'nav-accounts',
        kind: 'account' as const,
        title: 'Accounts',
        subtitle: 'Where journals land',
        pane: 'accounts' as const
      },
      {
        id: 'nav-sources',
        kind: 'source' as const,
        title: 'Sources',
        subtitle: 'Fields the engine can read',
        pane: 'sources' as const
      },
      {
        id: 'nav-versions',
        kind: 'version' as const,
        title: 'Versions',
        subtitle: 'Live accounting policy',
        pane: 'versions' as const
      }
    ];
  }

  const rank: Record<StudioSearchHit['kind'], number> = {
    ask: 0,
    transformation: 1,
    activity: 2,
    account: 3,
    source: 4,
    version: 5
  };
  return hits.sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 12);
}

function searchTerms(query: string): { terms: string[]; modifiers: Set<string> } {
  const modifiers = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 0)) {
    if (SEARCH_MODIFIERS.has(raw)) {
      modifiers.add(raw);
      continue;
    }
    if (SEARCH_STOP.has(raw) || raw.length === 1) {
      continue;
    }
    terms.push(raw);
  }
  return { terms, modifiers };
}

function matchesNeedles(hay: string, needles: string[]): boolean {
  const haystack = hay.toLowerCase();
  return needles.every((needle) => haystack.includes(needle));
}
