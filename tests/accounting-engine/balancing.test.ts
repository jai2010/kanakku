import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { Journal } from '../../src/domain/accounting/Journal';

describe('Accounting Engine - Balancing Validation (Production)', () => {
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
  });

  afterEach(() => {
    accountRepository.clear();
    journalRepository.clear();
  });

  it('should validate a balanced two-line journal', async () => {
    // Set up test accounts
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    // Create a balanced journal manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: 5000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 5000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });

  it('should detect an unbalanced journal with excess debit', async () => {
    // Set up test accounts
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    // Create an unbalanced journal manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: 6000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 5000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('JOURNAL_NOT_BALANCED');
  });

  it('should detect an unbalanced journal with excess credit', async () => {
    // Set up test accounts
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    // Create an unbalanced journal manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: 4000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 5000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('JOURNAL_NOT_BALANCED');
  });

  it('should validate a complex multi-line balanced journal', async () => {
    // Set up test accounts
    const travelAccount = createAccount({
      id: id('travel-account-id'),
      tenantId: id('test-tenant-id'),
      code: '5000',
      name: 'Travel',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const entertainmentAccount = createAccount({
      id: id('entertainment-account-id'),
      tenantId: id('test-tenant-id'),
      code: '5010',
      name: 'Entertainment',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const taxAccount = createAccount({
      id: id('tax-account-id'),
      tenantId: id('test-tenant-id'),
      code: '5020',
      name: 'Tax',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const creditCardAccount = createAccount({
      id: id('credit-card-account-id'),
      tenantId: id('test-tenant-id'),
      code: '2000',
      name: 'Credit Card',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    accountRepository.add(travelAccount);
    accountRepository.add(entertainmentAccount);
    accountRepository.add(taxAccount);
    accountRepository.add(creditCardAccount);

    // Create a complex balanced journal manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: travelAccount.id,
          debit: 3000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: entertainmentAccount.id,
          debit: 2000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-3'),
          journalId: id('test-journal-id'),
          accountId: taxAccount.id,
          debit: 1000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-4'),
          journalId: id('test-journal-id'),
          accountId: creditCardAccount.id,
          debit: 0,
          credit: 6000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });

  it('should validate a journal with fractional amounts', async () => {
    // Set up test accounts
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    // Create a journal with fractional amounts manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: 1000.50,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 1000.50,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });

  it('should reject journal with zero amounts', async () => {
    // Set up test accounts
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    // Create a journal with zero amounts manually for testing validation
    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Test journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: 0,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 0,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    // Zero debit and zero credit fails the domain line-side invariant first
    expect(validation.reason).toBe('INVALID_LINE_SIDE');
  });

  it('rejects Infinity amounts before treating them as balanced', async () => {
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });
    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });
    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    const journal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'Infinite journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: Number.POSITIVE_INFINITY,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: Number.POSITIVE_INFINITY,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('NON_FINITE_AMOUNT');
    await expect(accountingEngine.post(journal)).rejects.toThrow('NON_FINITE_AMOUNT');
  });

  it('rejects NaN and negative line amounts', async () => {
    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });
    const revenueAccount = createAccount({
      id: id('revenue-account-id'),
      tenantId: id('test-tenant-id'),
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });
    accountRepository.add(cashAccount);
    accountRepository.add(revenueAccount);

    const nanJournal: Journal = {
      id: id('test-journal-id'),
      tenantId: id('test-tenant-id'),
      businessEventId: id('test-event-id'),
      accountingTransactionId: id('test-transaction-id'),
      transactionDate: new Date(),
      currency: 'USD',
      description: 'NaN journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: Number.NaN,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 1000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    const negativeJournal: Journal = {
      ...nanJournal,
      lines: [
        {
          id: id('line-1'),
          journalId: id('test-journal-id'),
          accountId: cashAccount.id,
          debit: -1000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('test-journal-id'),
          accountId: revenueAccount.id,
          debit: 0,
          credit: 1000,
          currency: 'USD'
        }
      ]
    };

    const nanValidation = await accountingEngine.validateJournal(nanJournal);
    expect(nanValidation.valid).toBe(false);
    expect(nanValidation.reason).toBe('NON_FINITE_AMOUNT');

    const negativeValidation = await accountingEngine.validateJournal(negativeJournal);
    expect(negativeValidation.valid).toBe(false);
    expect(negativeValidation.reason).toBe('NON_POSITIVE_AMOUNT');
  });
});