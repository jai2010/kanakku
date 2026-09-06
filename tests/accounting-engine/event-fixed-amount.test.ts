import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';
import { BusinessEvent } from '../../src/domain/events/BusinessEvent';

describe('Accounting Engine — EVENT_AMOUNT and FIXED_AMOUNT fail-closed', () => {
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    journalRepository = new InMemoryJournalRepository();
    accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository,
        journalRepository
      }
    });

    accountRepository.add(createAccount({
      id: id('acc-expense'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: id('acc-cash'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));
  });

  afterEach(() => {
    accountRepository.clear();
    journalRepository.clear();
  });

  function eventWithAmount(amount: BusinessEvent['amount']): BusinessEvent {
    return createBusinessEvent({
      id: id('evt-amount'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount,
      currency: 'USD',
      attributes: {}
    });
  }

  function policyWithAmounts(debit: AmountExpression, credit: AmountExpression) {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-amount'),
      policyId: id('pol-amount'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-amount'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-expense'), side: 'DEBIT', amount: debit },
                  { accountId: id('acc-cash'), side: 'CREDIT', amount: credit }
                ]
              }
            }
          }
        ]
      }
    });
  }

  it('uses a finite EVENT_AMOUNT without coercing it', async () => {
    const journal = await accountingEngine.generateJournal(
      eventWithAmount(1500),
      policyWithAmounts({ type: 'EVENT_AMOUNT' }, { type: 'EVENT_AMOUNT' })
    );

    expect(journal.lines[0].debit).toBe(1500);
    expect(journal.lines[1].credit).toBe(1500);
  });

  it('fails closed when EVENT_AMOUNT is missing', async () => {
    await expect(
      accountingEngine.generateJournal(
        eventWithAmount(undefined),
        policyWithAmounts({ type: 'EVENT_AMOUNT' }, { type: 'EVENT_AMOUNT' })
      )
    ).rejects.toThrow('EVENT_AMOUNT failed closed');
  });

  it('rejects non-finite EVENT_AMOUNT at event ingestion', () => {
    expect(() => eventWithAmount(Number.NaN)).toThrow('BusinessEvent invalid');
    expect(() => eventWithAmount(Number.POSITIVE_INFINITY)).toThrow('BusinessEvent invalid');
    expect(() => eventWithAmount(Number.NEGATIVE_INFINITY)).toThrow('BusinessEvent invalid');
  });

  it('does not coerce EVENT_AMOUNT zero to a posted journal', async () => {
    const journal = await accountingEngine.generateJournal(
      eventWithAmount(0),
      policyWithAmounts({ type: 'EVENT_AMOUNT' }, { type: 'EVENT_AMOUNT' })
    );
    expect(journal.lines[0].debit).toBe(0);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
    await expect(accountingEngine.post(journal)).rejects.toThrow('INVALID_LINE_SIDE');
  });

  it('does not coerce EVENT_AMOUNT negative to zero; validation rejects it', async () => {
    const journal = await accountingEngine.generateJournal(
      eventWithAmount(-1000),
      policyWithAmounts({ type: 'EVENT_AMOUNT' }, { type: 'EVENT_AMOUNT' })
    );
    expect(journal.lines[0].debit).toBe(-1000);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('NON_POSITIVE_AMOUNT');
    await expect(accountingEngine.post(journal)).rejects.toThrow('NON_POSITIVE_AMOUNT');
  });

  it('uses a finite FIXED_AMOUNT', async () => {
    const journal = await accountingEngine.generateJournal(
      eventWithAmount(1500),
      policyWithAmounts(
        { type: 'FIXED_AMOUNT', value: 500, currency: 'USD' },
        { type: 'FIXED_AMOUNT', value: 500, currency: 'USD' }
      )
    );

    expect(journal.lines[0].debit).toBe(500);
    expect(journal.lines[1].credit).toBe(500);
  });

  it('rejects missing or non-finite FIXED_AMOUNT at policy write', () => {
    expect(() =>
      policyWithAmounts(
        { type: 'FIXED_AMOUNT', currency: 'USD' },
        { type: 'FIXED_AMOUNT', value: 500, currency: 'USD' }
      )
    ).toThrow('PolicyVersion invalid');

    expect(() =>
      policyWithAmounts(
        { type: 'FIXED_AMOUNT', value: Number.POSITIVE_INFINITY, currency: 'USD' },
        { type: 'FIXED_AMOUNT', value: 500, currency: 'USD' }
      )
    ).toThrow('PolicyVersion invalid');
  });
});
