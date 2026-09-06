import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';
import { BusinessEvent } from '../../src/domain/events/BusinessEvent';

describe('AccountingService.processEvent — error propagation', () => {
  let accountingService: AccountingService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();
    accountingService = new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    });

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
    policyVersionRepository.clear();
    journalRepository.clear();
  });

  function event(params: { id: string; eventType?: BusinessEvent['eventType']; amount?: number }): BusinessEvent {
    return createBusinessEvent({
      id: params.id,
      tenantId: id('tenant-1'),
      eventType: params.eventType ?? 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: params.amount,
      currency: 'USD',
      attributes: {}
    });
  }

  function addPolicy(params: {
    id: string;
    eventType: string;
    debitAccountId: string;
    debitAmount?: AmountExpression;
  }) {
    policyVersionRepository.add(createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id(params.id),
      policyId: id(`pol-${params.id}`),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id(`rule-${params.id}`),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: params.eventType },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: params.debitAccountId,
                    side: 'DEBIT',
                    amount: params.debitAmount ?? { type: 'EVENT_AMOUNT' }
                  },
                  { accountId: id('acc-cash'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    }));
  }

  it('does not rewrite a missing account as NO_MATCHING_RULE', async () => {
    addPolicy({ id: 'missing-account', eventType: 'PURCHASE', debitAccountId: id('acc-missing') });

    const result = await accountingService.processEvent(event({ id: id('evt-missing-account'), amount: 1000 }));

    expect(result.error).toContain('Account not found');
    expect(result.evaluation.reason).toBe('ACCOUNT_INVALID');
    expect(result.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(result.evaluation.matched).toBe(true);
    expect(result.postedJournal).toBeUndefined();
  });

  it('does not rewrite an inactive account as NO_MATCHING_RULE', async () => {
    accountRepository.add(createAccount({
      id: id('acc-inactive'),
      tenantId: id('tenant-1'),
      code: '9999',
      name: 'Inactive',
      type: 'EXPENSE',
      status: 'INACTIVE'
    }));
    addPolicy({ id: 'inactive-account', eventType: 'PURCHASE', debitAccountId: id('acc-inactive') });

    const result = await accountingService.processEvent(event({ id: id('evt-inactive-account'), amount: 1000 }));

    expect(result.error).toContain('Account is not active');
    expect(result.evaluation.reason).toBe('ACCOUNT_INVALID');
    expect(result.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(result.postedJournal).toBeUndefined();
  });

  it('does not rewrite an invalid amount as NO_MATCHING_RULE', async () => {
    accountRepository.add(createAccount({
      id: id('acc-expense'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    addPolicy({ id: 'invalid-amount', eventType: 'PURCHASE', debitAccountId: id('acc-expense') });

    const result = await accountingService.processEvent(event({ id: id('evt-invalid-amount') }));

    expect(result.error).toContain('EVENT_AMOUNT failed closed');
    expect(result.evaluation.reason).toBe('AMOUNT_INVALID');
    expect(result.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(result.evaluation.matched).toBe(true);
    expect(result.postedJournal).toBeUndefined();
  });

  it('keeps genuine no-match as NO_MATCHING_RULE', async () => {
    addPolicy({ id: 'purchase-only', eventType: 'PURCHASE', debitAccountId: id('acc-cash') });

    const result = await accountingService.processEvent(event({
      id: id('evt-no-match'),
      eventType: 'REFUND',
      amount: 1000
    }));

    expect(result.evaluation.matched).toBe(false);
    expect(result.evaluation.reason).toBe('NO_MATCHING_RULE');
    expect(result.error).toBe('No matching rule found for event');
    expect(result.postedJournal).toBeUndefined();
  });
});
