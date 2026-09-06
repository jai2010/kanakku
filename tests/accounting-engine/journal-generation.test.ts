import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { Journal } from '../../src/domain/accounting/Journal';
import { PolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';

describe('Accounting Engine - Journal Generation (Production)', () => {
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let journalRepository: InMemoryJournalRepository;

  const expenseAccountId = id('acc-expenses');
  const cashAccountId = id('acc-cash');
  const travelAccountId = id('acc-travel');
  const entertainmentAccountId = id('acc-entertainment');
  const taxAccountId = id('acc-tax');
  const creditCardAccountId = id('acc-credit-card');

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
      id: expenseAccountId,
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: cashAccountId,
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: travelAccountId,
      tenantId: id('tenant-1'),
      code: '5100',
      name: 'Travel',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: entertainmentAccountId,
      tenantId: id('tenant-1'),
      code: '5200',
      name: 'Entertainment',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: taxAccountId,
      tenantId: id('tenant-1'),
      code: '1800',
      name: 'Tax Receivable',
      type: 'ASSET',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: creditCardAccountId,
      tenantId: id('tenant-1'),
      code: '2000',
      name: 'Credit Card',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));
  });

  afterEach(() => {
    accountRepository.clear();
    journalRepository.clear();
  });

  function purchaseEvent(amount: number) {
    return createBusinessEvent({
      id: id('evt-journal-generation'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount,
      currency: 'INR',
      attributes: {}
    });
  }

  function policyWithLines(lines: TreatmentLine[]): PolicyVersion {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-journal-generation'),
      policyId: id('pol-journal-generation'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-journal-generation'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: { treatment: { lines } }
          }
        ]
      }
    });
  }

  function amount(type: AmountExpression['type'], value?: number): AmountExpression {
    if (type === 'FIXED_AMOUNT') {
      return { type, value, currency: 'INR' };
    }
    return { type };
  }

  function handBuiltJournal(lines: Journal['lines']): Journal {
    return {
      id: id('journal-test-id'),
      tenantId: id('tenant-1'),
      businessEventId: id('event-test-id'),
      accountingTransactionId: id('txn-test-id'),
      policyVersionId: id('pv-test-id'),
      ruleId: id('rule-test-id'),
      transactionDate: new Date('2026-09-03'),
      currency: 'INR',
      description: 'Test journal',
      lines,
      status: 'DRAFT',
      createdAt: new Date('2026-09-03')
    };
  }

  it('generates a valid two-line journal from a treatment', async () => {
    const journal = await accountingEngine.generateJournal(
      purchaseEvent(7800),
      policyWithLines([
        {
          accountId: expenseAccountId,
          side: 'DEBIT',
          amount: amount('EVENT_AMOUNT'),
          description: 'Business Meals Expense'
        },
        {
          accountId: cashAccountId,
          side: 'CREDIT',
          amount: amount('EVENT_AMOUNT'),
          description: 'Cash Payment'
        }
      ])
    );

    expect(journal.lines.length).toBe(2);
    expect(journal.lines[0].accountId).toBe(expenseAccountId);
    expect(journal.lines[0].debit).toBe(7800);
    expect(journal.lines[0].credit).toBe(0);
    expect(journal.lines[1].accountId).toBe(cashAccountId);
    expect(journal.lines[1].debit).toBe(0);
    expect(journal.lines[1].credit).toBe(7800);
    expect(journal.status).toBe('DRAFT');

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });

  it('rejects a one-line treatment at policy write', () => {
    expect(() =>
      policyWithLines([
        {
          accountId: expenseAccountId,
          side: 'DEBIT',
          amount: amount('EVENT_AMOUNT'),
          description: 'Business Meals Expense'
        }
      ])
    ).toThrow('PolicyVersion invalid');
  });

  it('validateJournal rejects a hand-built journal with both debit and credit > 0 on the same line', async () => {
    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-test-id'),
        accountId: expenseAccountId,
        debit: 5000,
        credit: 2000,
        currency: 'INR',
        description: 'Invalid line'
      },
      {
        id: id('line-2'),
        journalId: id('journal-test-id'),
        accountId: cashAccountId,
        debit: 0,
        credit: 7800,
        currency: 'INR',
        description: 'Cash Payment'
      }
    ]);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
  });

  it('validateJournal rejects a hand-built journal with both debit and credit = 0 on the same line', async () => {
    const journal = handBuiltJournal([
      {
        id: id('line-1'),
        journalId: id('journal-test-id'),
        accountId: expenseAccountId,
        debit: 0,
        credit: 0,
        currency: 'INR',
        description: 'Invalid line'
      },
      {
        id: id('line-2'),
        journalId: id('journal-test-id'),
        accountId: cashAccountId,
        debit: 0,
        credit: 7800,
        currency: 'INR',
        description: 'Cash Payment'
      }
    ]);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
  });

  it('generateJournal currently emits an unbalanced EVENT vs FIXED journal; validateJournal rejects it', async () => {
    const journal = await accountingEngine.generateJournal(
      purchaseEvent(7800),
      policyWithLines([
        {
          accountId: expenseAccountId,
          side: 'DEBIT',
          amount: amount('EVENT_AMOUNT'),
          description: 'Business Meals Expense'
        },
        {
          accountId: cashAccountId,
          side: 'CREDIT',
          amount: amount('FIXED_AMOUNT', 7500),
          description: 'Cash Payment'
        }
      ])
    );

    expect(journal.lines[0].debit).toBe(7800);
    expect(journal.lines[1].credit).toBe(7500);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('JOURNAL_NOT_BALANCED');
    expect(validation.totalDebits).toBe(7800);
    expect(validation.totalCredits).toBe(7500);
  });

  it('generates a multi-line journal from a four-line treatment', async () => {
    const event = createBusinessEvent({
      id: id('evt-split-generation'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 9000,
      currency: 'INR',
      attributes: {
        travelAmount: 6000,
        entertainmentAmount: 2000,
        taxAmount: 1000
      }
    });

    const journal = await accountingEngine.generateJournal(
      event,
      policyWithLines([
        {
          accountId: travelAccountId,
          side: 'DEBIT',
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'travelAmount' },
          description: 'Travel Expense'
        },
        {
          accountId: entertainmentAccountId,
          side: 'DEBIT',
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'entertainmentAmount' },
          description: 'Entertainment Expense'
        },
        {
          accountId: taxAccountId,
          side: 'DEBIT',
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' },
          description: 'Input Tax Receivable'
        },
        {
          accountId: creditCardAccountId,
          side: 'CREDIT',
          amount: amount('EVENT_AMOUNT'),
          description: 'Credit Card Payable'
        }
      ])
    );

    expect(journal.lines.length).toBe(4);

    const travelLine = journal.lines.find((line) => line.accountId === travelAccountId);
    const entertainmentLine = journal.lines.find((line) => line.accountId === entertainmentAccountId);
    const taxLine = journal.lines.find((line) => line.accountId === taxAccountId);
    const creditCardLine = journal.lines.find((line) => line.accountId === creditCardAccountId);

    expect(travelLine?.debit).toBe(6000);
    expect(entertainmentLine?.debit).toBe(2000);
    expect(taxLine?.debit).toBe(1000);
    expect(creditCardLine?.credit).toBe(9000);

    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(totalDebits).toBe(9000);
    expect(totalCredits).toBe(9000);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });
});
