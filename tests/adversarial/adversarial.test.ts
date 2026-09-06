import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent, EventType } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { Account } from '../../src/domain/accounting/Account';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';
import { Journal } from '../../src/domain/accounting/Journal';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';

describe('Adversarial Production Tests', () => {
  let accountingService: AccountingService;
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;
  let cashAccount: Account;
  let expenseAccount: Account;
  let liabilityAccount: Account;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();
    accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository,
        journalRepository
      }
    });
    accountingService = new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    });

    cashAccount = createAccount({
      id: id('cash-account'),
      tenantId: id('test-tenant'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });
    expenseAccount = createAccount({
      id: id('expense-account'),
      tenantId: id('test-tenant'),
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });
    liabilityAccount = createAccount({
      id: id('liability-account'),
      tenantId: id('test-tenant'),
      code: '2000',
      name: 'Liability',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(expenseAccount);
    accountRepository.add(liabilityAccount);
  });

  afterEach(() => {
    accountRepository.clear();
    policyVersionRepository.clear();
    journalRepository.clear();
  });

  function twoLineTreatment(
    debitAccountId: string,
    creditAccountId: string,
    debitAmount: AmountExpression = { type: 'EVENT_AMOUNT' },
    creditAmount: AmountExpression = { type: 'EVENT_AMOUNT' }
  ) {
    return {
      lines: [
        { accountId: debitAccountId, side: 'DEBIT' as const, amount: debitAmount },
        { accountId: creditAccountId, side: 'CREDIT' as const, amount: creditAmount }
      ]
    };
  }

  function addPolicy(params: {
    id: string;
    eventType: EventType;
    lines?: TreatmentLine[];
    extraRules?: Array<{
      id: string;
      priority: number;
      eventType: EventType;
      lines: TreatmentLine[];
    }>;
  }) {
    const lines = params.lines ?? twoLineTreatment(expenseAccount.id, cashAccount.id).lines;
    policyVersionRepository.add(createPolicyVersion({
      tenantId: id('test-tenant'),
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
            then: { treatment: { lines } }
          },
          ...(params.extraRules ?? []).map((rule) => ({
            id: id(rule.id),
            priority: rule.priority,
            when: { field: 'eventType', operator: 'equals' as const, value: rule.eventType },
            then: { treatment: { lines: rule.lines } }
          }))
        ]
      }
    }));
  }

  function event(params: {
    id: string;
    eventType: EventType;
    amount?: number;
  }) {
    return createBusinessEvent({
      id: params.id,
      tenantId: id('test-tenant'),
      eventType: params.eventType,
      occurredAt: new Date('2026-09-03'),
      amount: params.amount,
      currency: 'USD',
      attributes: {}
    });
  }

  function handBuiltJournal(lines: Journal['lines']): Journal {
    return {
      id: id('journal-adversarial'),
      tenantId: id('test-tenant'),
      businessEventId: id('evt-adversarial'),
      accountingTransactionId: id('txn-adversarial'),
      transactionDate: new Date('2026-09-03'),
      currency: 'USD',
      description: 'Adversarial journal',
      lines,
      status: 'DRAFT',
      createdAt: new Date('2026-09-03')
    };
  }

  it('rejects an unbalanced generated journal and does not post it', async () => {
    addPolicy({
      id: id('unbalanced'),
      eventType: 'PURCHASE',
      lines: twoLineTreatment(
        expenseAccount.id,
        liabilityAccount.id,
        { type: 'EVENT_AMOUNT' },
        { type: 'FIXED_AMOUNT', value: 500, currency: 'USD' }
      ).lines
    });

    const result = await accountingService.processEvent(event({
      id: id('evt-unbalanced'),
      eventType: 'PURCHASE',
      amount: 1000
    }));

    expect(result.error).toContain('JOURNAL_NOT_BALANCED');
    expect(result.journal).toBeDefined();
    expect(result.postedJournal).toBeUndefined();
    expect(await journalRepository.findByBusinessEventId(id('evt-unbalanced'), id('test-tenant'))).toEqual([]);
  });

  it('rejects Infinity even when both sides are Infinity', async () => {
    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: Number.POSITIVE_INFINITY,
        credit: 0,
        currency: 'USD'
      },
      {
        id: id('line-2'),
        journalId: id('journal-adversarial'),
        accountId: cashAccount.id,
        debit: 0,
        credit: Number.POSITIVE_INFINITY,
        currency: 'USD'
      }
    ]);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('NON_FINITE_AMOUNT');
    await expect(accountingEngine.post(journal)).rejects.toThrow('NON_FINITE_AMOUNT');
    expect(await journalRepository.getPostedJournal(journal.id)).toBeNull();
  });

  it('rejects NaN and -Infinity line amounts', async () => {
    const nanJournal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: Number.NaN,
        credit: 0,
        currency: 'USD'
      },
      {
        id: id('line-2'),
        journalId: id('journal-adversarial'),
        accountId: cashAccount.id,
        debit: 0,
        credit: 1000,
        currency: 'USD'
      }
    ]);
    const infJournal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: Number.NEGATIVE_INFINITY,
        credit: 0,
        currency: 'USD'
      },
      {
        id: id('line-2'),
        journalId: id('journal-adversarial'),
        accountId: cashAccount.id,
        debit: 0,
        credit: 1000,
        currency: 'USD'
      }
    ]);

    expect((await accountingEngine.validateJournal(nanJournal)).reason).toBe('NON_FINITE_AMOUNT');
    expect((await accountingEngine.validateJournal(infJournal)).reason).toBe('NON_FINITE_AMOUNT');
    await expect(accountingEngine.post(nanJournal)).rejects.toThrow('NON_FINITE_AMOUNT');
  });

  it('rejects both debit and credit populated on one line', async () => {
    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: 500,
        credit: 200,
        currency: 'USD'
      },
      {
        id: id('line-2'),
        journalId: id('journal-adversarial'),
        accountId: cashAccount.id,
        debit: 0,
        credit: 700,
        currency: 'USD'
      }
    ]);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
    await expect(accountingEngine.post(journal)).rejects.toThrow('INVALID_LINE_SIDE');
  });

  it('rejects neither debit nor credit populated', async () => {
    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: 0,
        credit: 0,
        currency: 'USD'
      },
      {
        id: id('line-2'),
        journalId: id('journal-adversarial'),
        accountId: cashAccount.id,
        debit: 0,
        credit: 1000,
        currency: 'USD'
      }
    ]);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
  });

  it('rejects insufficient journal lines', async () => {
    expect(() =>
      addPolicy({
        id: 'one-line',
        eventType: 'PURCHASE',
        lines: [
          { accountId: expenseAccount.id, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } }
        ]
      })
    ).toThrow('PolicyVersion invalid');

    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-adversarial'),
        accountId: expenseAccount.id,
        debit: 1000,
        credit: 0,
        currency: 'USD'
      }
    ]);
    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INSUFFICIENT_LINES');
    await expect(accountingEngine.post(journal)).rejects.toThrow('INSUFFICIENT_LINES');
  });

  it('rejects a missing account without labeling it NO_MATCHING_RULE', async () => {
    addPolicy({
      id: id('unknown-account'),
      eventType: 'PURCHASE',
      lines: twoLineTreatment(id('unknown-account-id'), cashAccount.id).lines
    });

    const result = await accountingService.processEvent(event({
      id: id('evt-unknown-account'),
      eventType: 'PURCHASE',
      amount: 1000
    }));

    expect(result.error).toContain('Account not found');
    expect(result.evaluation.reason).toBe('ACCOUNT_INVALID');
    expect(result.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(result.postedJournal).toBeUndefined();
  });

  it('rejects an inactive account without labeling it NO_MATCHING_RULE', async () => {
    const inactive = createAccount({
      id: id('inactive-account'),
      tenantId: id('test-tenant'),
      code: '6000',
      name: 'Inactive',
      type: 'EXPENSE',
      status: 'INACTIVE'
    });
    accountRepository.add(inactive);
    addPolicy({
      id: id('inactive-account'),
      eventType: 'PURCHASE',
      lines: twoLineTreatment(inactive.id, cashAccount.id).lines
    });

    const result = await accountingService.processEvent(event({
      id: id('evt-inactive-account'),
      eventType: 'PURCHASE',
      amount: 1000
    }));

    expect(result.error).toContain('Account is not active');
    expect(result.evaluation.reason).toBe('ACCOUNT_INVALID');
    expect(result.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(result.postedJournal).toBeUndefined();
  });

  it('rejects zero and negative EVENT_AMOUNT and does not post', async () => {
    addPolicy({ id: id('non-positive-amount'), eventType: 'PURCHASE' });

    const zero = await accountingService.processEvent(event({
      id: id('evt-zero-amount'),
      eventType: 'PURCHASE',
      amount: 0
    }));
    expect(zero.error).toContain('INVALID_LINE_SIDE');
    expect(zero.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(zero.postedJournal).toBeUndefined();

    const negative = await accountingService.processEvent(event({
      id: id('evt-negative-amount'),
      eventType: 'PURCHASE',
      amount: -1000
    }));
    expect(negative.error).toContain('NON_POSITIVE_AMOUNT');
    expect(negative.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(negative.postedJournal).toBeUndefined();
  });

  it('fails closed on invalid EVENT_AMOUNT without posting', async () => {
    addPolicy({ id: id('invalid-amount'), eventType: 'PURCHASE' });

    const missing = await accountingService.processEvent(event({
      id: id('evt-missing-amount'),
      eventType: 'PURCHASE'
    }));
    expect(missing.error).toContain('EVENT_AMOUNT failed closed');
    expect(missing.evaluation.reason).toBe('AMOUNT_INVALID');
    expect(missing.postedJournal).toBeUndefined();

    expect(() =>
      event({
        id: id('evt-infinite-amount'),
        eventType: 'PURCHASE',
        amount: Number.POSITIVE_INFINITY
      })
    ).toThrow('BusinessEvent invalid');
  });

  it('fails closed on missing FIXED_AMOUNT value', () => {
    expect(() =>
      addPolicy({
        id: 'fixed-missing',
        eventType: 'PURCHASE',
        lines: twoLineTreatment(
          expenseAccount.id,
          cashAccount.id,
          { type: 'FIXED_AMOUNT', currency: 'USD' },
          { type: 'FIXED_AMOUNT', value: 1000, currency: 'USD' }
        ).lines
      })
    ).toThrow('PolicyVersion invalid');
  });

  it('distinguishes conflicting rules from no-match and does not post', async () => {
    addPolicy({
      id: id('conflict'),
      eventType: 'PURCHASE',
      extraRules: [
        {
          id: id('conflicting-rule-2'),
          priority: 100,
          eventType: 'PURCHASE',
          lines: twoLineTreatment(expenseAccount.id, liabilityAccount.id).lines
        }
      ]
    });

    const conflict = await accountingService.processEvent(event({
      id: id('evt-conflicting'),
      eventType: 'PURCHASE',
      amount: 1000
    }));

    expect(conflict.evaluation.matched).toBe(true);
    expect(conflict.evaluation.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(conflict.evaluation.reason).not.toBe('NO_MATCHING_RULE');
    expect(conflict.evaluation.selectedRuleId).toBeUndefined();
    expect(conflict.postedJournal).toBeUndefined();
    expect(conflict.journal).toBeUndefined();

    addPolicy({ id: id('no-match'), eventType: 'PURCHASE' });
    const noMatch = await accountingService.processEvent(event({
      id: id('evt-no-match'),
      eventType: 'REFUND',
      amount: 1000
    }));
    expect(noMatch.evaluation.matched).toBe(false);
    expect(noMatch.evaluation.reason).toBe('NO_MATCHING_RULE');
    expect(noMatch.postedJournal).toBeUndefined();
  });

  it('does not create a second original journal for the same event id', async () => {
    addPolicy({ id: id('idempotency'), eventType: 'PURCHASE' });
    const businessEvent = event({
      id: id('evt-idempotency-test'),
      eventType: 'PURCHASE',
      amount: 1000
    });

    const first = await accountingService.processEvent(businessEvent);
    const second = await accountingService.processEvent(businessEvent);

    expect(first.postedJournal?.id).toBeDefined();
    expect(second.postedJournal?.id).toBe(first.postedJournal?.id);
    expect(await journalRepository.findByBusinessEventId(businessEvent.id, id('test-tenant'))).toHaveLength(1);
  });

  it('does not let draft mutation change a posted journal', async () => {
    addPolicy({ id: id('mutation'), eventType: 'PURCHASE' });
    const result = await accountingService.processEvent(event({
      id: id('evt-mutation-test'),
      eventType: 'PURCHASE',
      amount: 1000
    }));

    const draft = result.journal;
    const posted = result.postedJournal;
    expect(draft).toBeDefined();
    expect(posted).toBeDefined();
    if (!draft || !posted) {
      return;
    }

    const originalDebit = posted.lines[0].debit;
    draft.lines[0].debit = originalDebit + 50;
    expect(posted.lines[0].debit).toBe(originalDebit);

    const stored = await journalRepository.getPostedJournal(posted.id);
    expect(stored?.lines[0].debit).toBe(originalDebit);
  });

  it('rejects a second reversal of a persisted posted journal', async () => {
    addPolicy({ id: id('reversal'), eventType: 'PURCHASE' });
    const result = await accountingService.processEvent(event({
      id: id('evt-reversal-test'),
      eventType: 'PURCHASE',
      amount: 1000
    }));
    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const first = await accountingService.reverseJournal(postedId, 'first', id('test-tenant'));
    const second = await accountingService.reverseJournal(postedId, 'second', id('test-tenant'));

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.message).toBe('Journal has already been reversed');
  });
});
