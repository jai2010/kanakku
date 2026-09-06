import { id } from '../fixtures/ids';
import { createBusinessEvent, BusinessEventSchema } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion, PolicyVersionSchema } from '../../src/domain/policies/PolicyVersion';
import { createAccount, AccountSchema } from '../../src/domain/accounting/Account';
import { createAccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { createJournal } from '../../src/domain/accounting/Journal';
import { WhenClauseSchema } from '../../src/domain/policies/PolicyIR';
import { parseDomain } from '../../src/domain/parse';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';

describe('Runtime domain contracts', () => {
  it('rejects a malformed BusinessEvent enum at creation', () => {
    expect(() =>
      parseDomain(BusinessEventSchema, {
        id: id('evt-bad-type'),
        tenantId: id('tenant-1'),
        eventType: 'NOT_AN_EVENT',
        occurredAt: new Date('2026-09-03'),
        attributes: {},
        createdAt: new Date()
      }, 'BusinessEvent')
    ).toThrow('BusinessEvent invalid');
  });

  it('rejects a non-UUID tenantId on BusinessEvent', () => {
    expect(() =>
      createBusinessEvent({
        id: id('evt-bad-tenant'),
        tenantId: 'tenant-1',
        eventType: 'PURCHASE',
        occurredAt: new Date('2026-09-03'),
        attributes: {}
      })
    ).toThrow('BusinessEvent invalid');
  });

  it('rejects malformed PolicyIR at PolicyVersion creation', () => {
    expect(() =>
      parseDomain(PolicyVersionSchema, {
        id: id('pv-bad-ir'),
        policyId: id('pol-bad-ir'),
        tenantId: id('tenant-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        createdAt: new Date(),
        definition: {
          rules: [
            {
              id: id('rule-bad'),
              priority: 100,
              when: { all: [{ field: 'eventType', operator: 'equals', value: 'PURCHASE' }] },
              then: {
                treatment: {
                  lines: [
                    { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                    { accountId: id('acc-2'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                  ]
                }
              }
            }
          ]
        }
      }, 'PolicyVersion')
    ).toThrow('PolicyVersion invalid');
  });

  it('rejects an invalid amount expression at PolicyVersion creation', () => {
    expect(() =>
      createPolicyVersion({
        id: id('pv-bad-amount'),
        policyId: id('pol-bad-amount'),
        tenantId: id('tenant-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        definition: {
          rules: [
            {
              id: id('rule-bad-amount'),
              priority: 100,
              when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
              then: {
                treatment: {
                  lines: [
                    { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'FIXED_AMOUNT', currency: 'USD' } },
                    { accountId: id('acc-2'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                  ]
                }
              }
            }
          ]
        }
      })
    ).toThrow('PolicyVersion invalid');
  });

  it('rejects a malformed treatment with fewer than two lines', () => {
    expect(() =>
      createAccountingTreatment({
        lines: [
          { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } }
        ]
      })
    ).toThrow('AccountingTreatment invalid');
  });

  it('rejects an invalid account type enum', () => {
    expect(() =>
      parseDomain(AccountSchema, {
        id: id('acc-bad-type'),
        tenantId: id('tenant-1'),
        code: '1000',
        name: 'Cash',
        type: 'BANK',
        status: 'ACTIVE',
        createdAt: new Date()
      }, 'Account')
    ).toThrow('Account invalid');
  });

  it('rejects a malformed journal at the factory', () => {
    expect(() =>
      createJournal({
        tenantId: id('tenant-1'),
        businessEventId: id('evt-1'),
        accountingTransactionId: id('txn-1'),
        transactionDate: new Date(),
        currency: 'USD',
        description: 'bad',
        lines: [
          {
            id: id('line-1'),
            journalId: id('journal-1'),
            accountId: id('acc-1'),
            debit: 10,
            credit: 10,
            currency: 'USD'
          },
          {
            id: id('line-2'),
            journalId: id('journal-1'),
            accountId: id('acc-2'),
            debit: 0,
            credit: 0,
            currency: 'USD'
          }
        ],
        status: 'DRAFT'
      })
    ).toThrow('Journal invalid');
  });

  it('parses AND-only and OR-only when clauses', () => {
    expect(WhenClauseSchema.safeParse({
      AND: [{ field: 'eventType', operator: 'equals', value: 'PURCHASE' }]
    }).success).toBe(true);
    expect(WhenClauseSchema.safeParse({
      OR: [{ field: 'eventType', operator: 'equals', value: 'PURCHASE' }]
    }).success).toBe(true);
    expect(WhenClauseSchema.safeParse({
      AND: [{ field: 'eventType', operator: 'equals', value: 'PURCHASE' }],
      OR: [{ field: 'eventType', operator: 'equals', value: 'REFUND' }],
      NOT: { field: 'eventType', operator: 'equals', value: 'PAYMENT' }
    }).success).toBe(false);
  });

  it('fails closed when event currency is missing at journal generation', async () => {
    const accountRepository = new InMemoryAccountRepository();
    const policyVersionRepository = new InMemoryPolicyVersionRepository();
    const journalRepository = new InMemoryJournalRepository();
    const accountingService = new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    });

    accountRepository.add(createAccount({
      id: id('acc-cash-ccy'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    }));
    accountRepository.add(createAccount({
      id: id('acc-exp-ccy'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE'
    }));
    policyVersionRepository.add(createPolicyVersion({
      id: id('pv-ccy'),
      policyId: id('pol-ccy'),
      tenantId: id('tenant-1'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-ccy'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-exp-ccy'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-cash-ccy'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    }));

    const result = await accountingService.processEvent(createBusinessEvent({
      id: id('evt-missing-ccy'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1000,
      attributes: {}
    }));

    expect(result.error).toContain('CURRENCY_INVALID');
    expect(result.postedJournal).toBeUndefined();
  });
});
