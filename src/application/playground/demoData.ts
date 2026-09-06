import { createHash } from 'crypto';
import { Account, createAccount } from '../../domain/accounting/Account';
import { BusinessEvent, createBusinessEvent } from '../../domain/events/BusinessEvent';

export function playgroundId(name: string): string {
  const hex = createHash('sha1').update(`sutra:playground:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const PLAYGROUND_TENANT_ID = playgroundId('tenant');

export const PLAYGROUND_ACCOUNT_IDS = {
  meals: playgroundId('acc-5220'),
  cash: playgroundId('acc-2000'),
  payable: playgroundId('acc-2100'),
  misc: playgroundId('acc-5000')
} as const;

export type PlaygroundSampleEvent = {
  label: string;
  event: BusinessEvent;
};

export const DEMO_MEALS_DSL = `POLICY "Business Meals"
VERSION 1
EFFECTIVE FROM "2026-01-01"

RULE "Starbucks over threshold"
PRIORITY 100

WHEN
eventType = "PURCHASE"
AND counterparty = "Starbucks"
AND amount > 5000

THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT DESCRIPTION "Business meals"
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT DESCRIPTION "Cash"
`;

export const DEFAULT_INSTRUCTION =
  'Starbucks purchases above ₹5,000 should be treated as Business Meals, debiting 5220 and crediting cash.';

export function createPlaygroundAccounts(): Account[] {
  return [
    createAccount({
      id: PLAYGROUND_ACCOUNT_IDS.meals,
      tenantId: PLAYGROUND_TENANT_ID,
      code: '5220',
      name: 'Business Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }),
    createAccount({
      id: PLAYGROUND_ACCOUNT_IDS.cash,
      tenantId: PLAYGROUND_TENANT_ID,
      code: '2000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }),
    createAccount({
      id: PLAYGROUND_ACCOUNT_IDS.payable,
      tenantId: PLAYGROUND_TENANT_ID,
      code: '2100',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }),
    createAccount({
      id: PLAYGROUND_ACCOUNT_IDS.misc,
      tenantId: PLAYGROUND_TENANT_ID,
      code: '5000',
      name: 'Misc Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    })
  ];
}

export function createPlaygroundSampleEvents(): PlaygroundSampleEvent[] {
  return [
    {
      label: 'Starbucks ₹7,800',
      event: createBusinessEvent({
        id: playgroundId('evt-starbucks-7800'),
        tenantId: PLAYGROUND_TENANT_ID,
        eventType: 'PURCHASE',
        occurredAt: new Date('2026-09-03T00:00:00.000Z'),
        amount: 7800,
        currency: 'INR',
        counterparty: 'Starbucks',
        attributes: {},
        source: 'API'
      })
    },
    {
      label: 'Starbucks ₹2,000',
      event: createBusinessEvent({
        id: playgroundId('evt-starbucks-2000'),
        tenantId: PLAYGROUND_TENANT_ID,
        eventType: 'PURCHASE',
        occurredAt: new Date('2026-09-03T00:00:00.000Z'),
        amount: 2000,
        currency: 'INR',
        counterparty: 'Starbucks',
        attributes: {},
        source: 'API'
      })
    },
    {
      label: 'Amazon ₹8,000',
      event: createBusinessEvent({
        id: playgroundId('evt-amazon-8000'),
        tenantId: PLAYGROUND_TENANT_ID,
        eventType: 'PURCHASE',
        occurredAt: new Date('2026-09-03T00:00:00.000Z'),
        amount: 8000,
        currency: 'INR',
        counterparty: 'Amazon',
        attributes: {},
        source: 'API'
      })
    }
  ];
}

export function playgroundAccountMap(accounts: Account[]): Map<string, string> {
  return new Map(accounts.map((account) => [account.code, account.id]));
}
