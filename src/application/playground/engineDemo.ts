import { createHash } from 'crypto';
import { Account, createAccount } from '../../domain/accounting/Account';
import { EventType } from '../../domain/events/BusinessEvent';
import { TransactionalTreatment } from '../../domain/transactional';

export function engineId(name: string): string {
  const hex = createHash('sha1').update(`sutra:engine:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const ENGINE_TENANT_ID = engineId('tenant');

export type EngineAccountSeed = {
  code: string;
  name: string;
  type: Account['type'];
};

export const ENGINE_ACCOUNTS: EngineAccountSeed[] = [
  { code: '5220', name: 'Business Meals', type: 'EXPENSE' },
  { code: '2000', name: 'Corporate Card', type: 'LIABILITY' },
  { code: '2100', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2110', name: 'Seller Payable', type: 'LIABILITY' },
  { code: '2200', name: 'Tax Payable', type: 'LIABILITY' },
  { code: '2300', name: 'Buyer Wallet', type: 'LIABILITY' },
  { code: '6100', name: 'Software Expense', type: 'EXPENSE' },
  { code: '6200', name: 'Cloud Infrastructure', type: 'EXPENSE' },
  { code: '6300', name: 'Travel Expense', type: 'EXPENSE' },
  { code: '6400', name: 'Office Expense', type: 'EXPENSE' },
  { code: '5000', name: 'Unknown Expense', type: 'EXPENSE' },
  { code: '1010', name: 'Cash', type: 'ASSET' },
  { code: '4110', name: 'Marketplace Fee Revenue', type: 'INCOME' },
  { code: '6500', name: 'Bank Charges', type: 'EXPENSE' },
  { code: '4900', name: 'Customer Refunds', type: 'EXPENSE' }
];

export type EngineCondition = {
  field: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN';
  value: string | number | ReadonlyArray<string>;
};

export type EngineAmountType = 'EVENT_AMOUNT' | 'FIXED_AMOUNT' | 'ATTRIBUTE_AMOUNT' | 'RATE_AMOUNT';

export type EngineTreatmentLineSeed = {
  side: 'DEBIT' | 'CREDIT';
  accountCode: string;
  amountType: EngineAmountType;
  value?: number;
  currency?: string;
  attribute?: string;
  rate?: number;
  description?: string;
};

export type EngineRuleSeed = {
  name: string;
  priority: number;
  conditions: EngineCondition[];
  debitCode: string;
  creditCode: string;
  lines?: EngineTreatmentLineSeed[];
  transactional?: TransactionalTreatment;
};

export function treatmentLinesFor(rule: EngineRuleSeed): EngineTreatmentLineSeed[] {
  if (rule.lines !== undefined && rule.lines.length >= 2) {
    return rule.lines;
  }
  return [
    { side: 'DEBIT', accountCode: rule.debitCode, amountType: 'EVENT_AMOUNT' },
    { side: 'CREDIT', accountCode: rule.creditCode, amountType: 'EVENT_AMOUNT' }
  ];
}

export const MARKETPLACE_FEE_RATE = 0.05;
export const MARKETPLACE_TAX_RATE = 0.09;

export const ENGINE_PARTICIPANTS: Array<{
  participantId: string;
  kind: 'BUYER' | 'SELLER';
  name: string;
}> = [
  { participantId: 'B001', kind: 'BUYER', name: 'Priya' },
  { participantId: 'B002', kind: 'BUYER', name: 'Alex' },
  { participantId: 'B003', kind: 'BUYER', name: 'Sam' },
  { participantId: 'S001', kind: 'SELLER', name: 'Acme Electronics' },
  { participantId: 'S002', kind: 'SELLER', name: 'TechWorld' },
  { participantId: 'S003', kind: 'SELLER', name: 'FashionHub' }
];

const MARKETPLACE_SALE_LINES: EngineTreatmentLineSeed[] = [
  { side: 'DEBIT', accountCode: '1010', amountType: 'EVENT_AMOUNT', description: 'Cash' },
  { side: 'CREDIT', accountCode: '2110', amountType: 'EVENT_AMOUNT', description: 'Seller Payable' },
  { side: 'DEBIT', accountCode: '2110', amountType: 'RATE_AMOUNT', rate: MARKETPLACE_FEE_RATE, description: 'Marketplace fee' },
  { side: 'CREDIT', accountCode: '4110', amountType: 'RATE_AMOUNT', rate: MARKETPLACE_FEE_RATE, description: 'Marketplace Fee Revenue' },
  { side: 'DEBIT', accountCode: '2110', amountType: 'RATE_AMOUNT', rate: MARKETPLACE_TAX_RATE, description: 'Tax' },
  { side: 'CREDIT', accountCode: '2200', amountType: 'RATE_AMOUNT', rate: MARKETPLACE_TAX_RATE, description: 'Tax Payable' }
];

const MARKETPLACE_SALE_TRANSACTIONAL: TransactionalTreatment = {
  participantKind: 'SELLER',
  participantField: 'attributes.sellerId',
  effects: [
    { type: 'SALE', direction: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Gross sale' },
    { type: 'FEE', direction: 'DEBIT', amount: { type: 'RATE', rate: MARKETPLACE_FEE_RATE }, description: 'Marketplace fee' },
    { type: 'TAX', direction: 'DEBIT', amount: { type: 'RATE', rate: MARKETPLACE_TAX_RATE }, description: 'Tax' }
  ]
};

export const ENGINE_RULES: EngineRuleSeed[] = [
  {
    name: 'AWS Infrastructure',
    priority: 130,
    conditions: [
      { field: 'eventType', op: '=', value: 'USAGE' },
      { field: 'counterparty', op: '=', value: 'AWS' }
    ],
    debitCode: '6200',
    creditCode: '2100'
  },
  {
    name: 'AWS / Software',
    priority: 126,
    conditions: [
      { field: 'eventType', op: '=', value: 'PURCHASE' },
      { field: 'counterparty', op: '=', value: 'AWS' }
    ],
    debitCode: '6100',
    creditCode: '2100'
  },
  {
    name: 'Marketplace Sale',
    priority: 125,
    conditions: [
      { field: 'eventType', op: '=', value: 'MARKETPLACE_SALE' }
    ],
    debitCode: '1010',
    creditCode: '2110',
    lines: MARKETPLACE_SALE_LINES,
    transactional: MARKETPLACE_SALE_TRANSACTIONAL
  },
  {
    name: 'Seller Payout',
    priority: 124,
    conditions: [
      { field: 'eventType', op: '=', value: 'SELLER_PAYOUT' }
    ],
    debitCode: '2110',
    creditCode: '1010',
    transactional: {
      participantKind: 'SELLER',
      participantField: 'attributes.sellerId',
      effects: [
        { type: 'PAYOUT', direction: 'DEBIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Payout' }
      ]
    }
  },
  {
    name: 'Wallet Load',
    priority: 123,
    conditions: [
      { field: 'eventType', op: '=', value: 'WALLET_LOAD' }
    ],
    debitCode: '1010',
    creditCode: '2300',
    transactional: {
      participantKind: 'BUYER',
      participantField: 'attributes.buyerId',
      effects: [
        { type: 'WALLET_LOAD', direction: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Wallet Load' }
      ]
    }
  },
  {
    name: 'Wallet Spend',
    priority: 122,
    conditions: [
      { field: 'eventType', op: '=', value: 'WALLET_SPEND' }
    ],
    debitCode: '2300',
    creditCode: '1010',
    transactional: {
      participantKind: 'BUYER',
      participantField: 'attributes.buyerId',
      effects: [
        { type: 'WALLET_SPEND', direction: 'DEBIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Purchase' }
      ]
    }
  },
  {
    name: 'Amazon Software',
    priority: 120,
    conditions: [
      { field: 'eventType', op: '=', value: 'PURCHASE' },
      { field: 'counterparty', op: '=', value: 'Amazon' },
      { field: 'amount', op: '>', value: 5000 }
    ],
    debitCode: '6100',
    creditCode: '2100'
  },
  {
    name: 'Starbucks Meals',
    priority: 110,
    conditions: [
      { field: 'eventType', op: '=', value: 'PURCHASE' },
      { field: 'counterparty', op: '=', value: 'Starbucks' },
      { field: 'amount', op: '>', value: 1000 }
    ],
    debitCode: '5220',
    creditCode: '2000'
  },
  {
    name: 'Travel — Flights',
    priority: 100,
    conditions: [
      { field: 'eventType', op: '=', value: 'PURCHASE' },
      { field: 'counterparty', op: 'IN', value: ['Air India', 'Emirates', 'Uber'] }
    ],
    debitCode: '6300',
    creditCode: '2000'
  },
  {
    name: 'General Purchase',
    priority: 90,
    conditions: [
      { field: 'eventType', op: '=', value: 'PURCHASE' }
    ],
    debitCode: '5000',
    creditCode: '1010'
  },
  {
    name: 'Customer Refund',
    priority: 80,
    conditions: [
      { field: 'eventType', op: '=', value: 'REFUND' }
    ],
    debitCode: '4900',
    creditCode: '1010'
  },
  {
    name: 'Bank Fee',
    priority: 70,
    conditions: [
      { field: 'eventType', op: '=', value: 'PAYMENT' },
      { field: 'counterparty', op: '=', value: 'Bank Fee' }
    ],
    debitCode: '6500',
    creditCode: '1010'
  }
];

export type EngineUsageSeed = {
  meter: string;
  quantity: number;
  unitPrice: number;
  unit: string;
};

export type EngineExampleSeed = {
  key: string;
  merchant: string;
  amount: number;
  type: EventType;
  category: string;
  mark: string;
  tint: string;
  usage?: EngineUsageSeed;
  attributes?: Record<string, unknown>;
};

export const ENGINE_EXAMPLES: EngineExampleSeed[] = [
  { key: 'starbucks', merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', category: 'Coffee chain', mark: 'sb', tint: '#00704a' },
  { key: 'acme-sale', merchant: 'Acme Electronics', amount: 10000, type: 'MARKETPLACE_SALE', category: 'Marketplace Sale', mark: 'ae', tint: '#d97706', attributes: { sellerId: 'S001', orderId: 'ORD-1001' } },
  { key: 'priya-load', merchant: 'Priya', amount: 10000, type: 'WALLET_LOAD', category: 'Wallet Load', mark: 'pr', tint: '#0ea5e9', attributes: { buyerId: 'B001' } },
  { key: 'priya-spend', merchant: 'Priya', amount: 2500, type: 'WALLET_SPEND', category: 'Wallet Purchase', mark: 'pr', tint: '#0ea5e9', attributes: { buyerId: 'B001' } },
  { key: 'aws-ec2', merchant: 'AWS', amount: 480, type: 'USAGE', category: 'EC2 Compute', mark: 'ec2', tint: '#ff9900', usage: { meter: 'compute_hours', quantity: 10, unitPrice: 48, unit: 'hours' } },
  { key: 'techworld-sale', merchant: 'TechWorld', amount: 5000, type: 'MARKETPLACE_SALE', category: 'Marketplace Sale', mark: 'tw', tint: '#6366f1', attributes: { sellerId: 'S002', orderId: 'ORD-1002' } },
  { key: 'aws-s3', merchant: 'AWS', amount: 124, type: 'USAGE', category: 'S3 Storage', mark: 's3', tint: '#569a31', usage: { meter: 'storage_gb', quantity: 50, unitPrice: 2.48, unit: 'GB' } },
  { key: 'amazon', merchant: 'Amazon', amount: 8000, type: 'PURCHASE', category: 'E-commerce', mark: 'az', tint: '#232f3e' },
  { key: 'uber', merchant: 'Uber', amount: 1240, type: 'PURCHASE', category: 'Transport', mark: 'ub', tint: '#0f0f0f' },
  { key: 'unknown-saas', merchant: 'Unknown SaaS', amount: 240, type: 'USAGE', category: 'API calls', mark: 'sa', tint: '#6b4ea2', usage: { meter: 'api_calls', quantity: 1000, unitPrice: 0.24, unit: 'calls' } },
  { key: 'aws', merchant: 'AWS', amount: 82400, type: 'PURCHASE', category: 'Cloud Services', mark: 'aws', tint: '#ff9900' },
  { key: 'air-india', merchant: 'Air India', amount: 47200, type: 'PURCHASE', category: 'Travel', mark: 'ai', tint: '#d71921' },
  { key: 'office-depot', merchant: 'Office Depot', amount: 12450, type: 'PURCHASE', category: 'Office Supplies', mark: 'od', tint: '#cc0000' },
  { key: 'refund', merchant: 'Customer Refund', amount: 5000, type: 'REFUND', category: 'Refund', mark: 'rf', tint: '#128a5e' },
  { key: 'bank-fee', merchant: 'Bank Fee', amount: 590, type: 'PAYMENT', category: 'Bank', mark: 'bk', tint: '#6b4ea2' },
  { key: 'fashionhub-payout', merchant: 'FashionHub', amount: 1720, type: 'SELLER_PAYOUT', category: 'Payout', mark: 'fh', tint: '#db2777', attributes: { sellerId: 'S003' } }
];

export type EngineDemoRun = {
  merchant: string;
  amount: number;
  type: EventType;
  category: string;
  mark: string;
  tint: string;
  attributes?: Record<string, unknown>;
  usage?: EngineUsageSeed;
};

export const ENGINE_DEMO_RUNS: EngineDemoRun[] = [
  { merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', category: 'Coffee chain', mark: 'sb', tint: '#00704a' },
  { merchant: 'AWS', amount: 82400, type: 'PURCHASE', category: 'Cloud Services', mark: 'aws', tint: '#ff9900' },
  { merchant: 'Amazon', amount: 8000, type: 'PURCHASE', category: 'E-commerce', mark: 'az', tint: '#232f3e' },
  { merchant: 'Bank Fee', amount: 590, type: 'PAYMENT', category: 'Bank', mark: 'bk', tint: '#6b4ea2' },
  { merchant: 'Air India', amount: 47200, type: 'PURCHASE', category: 'Travel', mark: 'ai', tint: '#d71921' },
  { merchant: 'Customer Refund', amount: 5000, type: 'REFUND', category: 'Refund', mark: 'rf', tint: '#128a5e' },
  { merchant: 'Priya', amount: 10000, type: 'WALLET_LOAD', category: 'Wallet Load', mark: 'pr', tint: '#0ea5e9', attributes: { buyerId: 'B001' } },
  { merchant: 'Priya', amount: 2500, type: 'WALLET_SPEND', category: 'Wallet Purchase', mark: 'pr', tint: '#0ea5e9', attributes: { buyerId: 'B001' } },
  { merchant: 'Priya', amount: 1200, type: 'WALLET_SPEND', category: 'Wallet Purchase', mark: 'pr', tint: '#0ea5e9', attributes: { buyerId: 'B001' } },
  { merchant: 'Alex', amount: 5000, type: 'WALLET_LOAD', category: 'Wallet Load', mark: 'al', tint: '#38bdf8', attributes: { buyerId: 'B002' } },
  { merchant: 'Alex', amount: 800, type: 'WALLET_SPEND', category: 'Wallet Purchase', mark: 'al', tint: '#38bdf8', attributes: { buyerId: 'B002' } },
  { merchant: 'Sam', amount: 2000, type: 'WALLET_LOAD', category: 'Wallet Load', mark: 'sm', tint: '#7dd3fc', attributes: { buyerId: 'B003' } },
  { merchant: 'Acme Electronics', amount: 10000, type: 'MARKETPLACE_SALE', category: 'Marketplace Sale', mark: 'ae', tint: '#d97706', attributes: { sellerId: 'S001', orderId: 'ORD-1001' } },
  { merchant: 'TechWorld', amount: 5000, type: 'MARKETPLACE_SALE', category: 'Marketplace Sale', mark: 'tw', tint: '#6366f1', attributes: { sellerId: 'S002', orderId: 'ORD-1002' } },
  { merchant: 'FashionHub', amount: 2000, type: 'MARKETPLACE_SALE', category: 'Marketplace Sale', mark: 'fh', tint: '#db2777', attributes: { sellerId: 'S003', orderId: 'ORD-1003' } },
  { merchant: 'FashionHub', amount: 1720, type: 'SELLER_PAYOUT', category: 'Payout', mark: 'fh', tint: '#db2777', attributes: { sellerId: 'S003' } }
];

export function createEngineAccounts(): Account[] {
  return ENGINE_ACCOUNTS.map((account) =>
    createAccount({
      id: engineId(`acc-${account.code}`),
      tenantId: ENGINE_TENANT_ID,
      code: account.code,
      name: account.name,
      type: account.type,
      status: 'ACTIVE'
    })
  );
}

export function engineAccountMap(accounts: Account[]): Map<string, string> {
  return new Map(accounts.map((account) => [account.code, account.id]));
}

export function formatCondition(condition: EngineCondition): string {
  const field = condition.field === 'eventType' ? 'type' : condition.field;
  if (condition.op === 'IN' && Array.isArray(condition.value)) {
    return `${field} in (${condition.value.join(', ')})`;
  }
  if (typeof condition.value === 'number') {
    return `${field} ${condition.op} ${condition.value.toLocaleString('en-IN')}`;
  }
  const value = condition.field === 'eventType'
    ? String(condition.value).charAt(0) + String(condition.value).slice(1).toLowerCase()
    : String(condition.value);
  return `${field} ${condition.op} ${value}`;
}

export function conditionToDsl(condition: EngineCondition): string {
  if (condition.op === 'IN' && Array.isArray(condition.value)) {
    return `${condition.field} IN [${condition.value.map((item) => JSON.stringify(item)).join(', ')}]`;
  }
  if (typeof condition.value === 'number') {
    return `${condition.field} ${condition.op} ${condition.value}`;
  }
  return `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`;
}

function serializeAmount(line: EngineTreatmentLineSeed): string {
  if (line.amountType === 'FIXED_AMOUNT' && line.value !== undefined && line.currency !== undefined) {
    return `FIXED_AMOUNT ${line.value} ${JSON.stringify(line.currency)}`;
  }
  if (line.amountType === 'ATTRIBUTE_AMOUNT' && line.attribute !== undefined) {
    return `ATTRIBUTE_AMOUNT ${line.attribute}`;
  }
  if (line.amountType === 'RATE_AMOUNT' && line.rate !== undefined) {
    return `RATE_AMOUNT ${line.rate}`;
  }
  return 'EVENT_AMOUNT';
}

export function participantById(participantId: string): { participantId: string; kind: 'BUYER' | 'SELLER'; name: string } | undefined {
  return ENGINE_PARTICIPANTS.find((row) => row.participantId === participantId);
}

export function participantByName(name: string): { participantId: string; kind: 'BUYER' | 'SELLER'; name: string } | undefined {
  const needle = name.trim().toLowerCase();
  return ENGINE_PARTICIPANTS.find((row) =>
    row.name.toLowerCase() === needle
    || row.participantId.toLowerCase() === needle
    || `buyer ${row.participantId}`.toLowerCase() === needle
  );
}

export function renderEngineDsl(rules: Array<EngineRuleSeed & { debitName: string; creditName: string }>, version: number): string {
  const body = rules.map((rule) => {
    const when = rule.conditions.map((condition, index) => {
      const line = conditionToDsl(condition);
      return index === 0 ? line : `AND ${line}`;
    }).join('\n');
    const then = treatmentLinesFor(rule).map((line) => {
      const description = line.description
        ?? (line.side === 'DEBIT' ? rule.debitName : rule.creditName);
      return `${line.side} ACCOUNT ${JSON.stringify(line.accountCode)} AMOUNT ${serializeAmount(line)} DESCRIPTION ${JSON.stringify(description)}`;
    }).join('\n');
    return `RULE ${JSON.stringify(rule.name)}
PRIORITY ${rule.priority}

WHEN
${when}

THEN
${then}`;
  }).join('\n\n');

  return `POLICY "Kanakku Live Engine"
VERSION ${version}
EFFECTIVE FROM "2026-01-01"

${body}
`;
}
