import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { PolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Accounting Engine - Multi-line Journal Handling (Production)', () => {
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

  it('should correctly process a simple two-line treatment', async () => {
    // Set up test accounts
    const expenseAccount = createAccount({
      id: id('expense-account-id'),
      tenantId: id('test-tenant-id'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    accountRepository.add(expenseAccount);
    accountRepository.add(cashAccount);

    // Create a policy version with a simple two-line treatment
    const policyVersion: PolicyVersion = {
      id: id('test-policy-version'),
      policyId: id('test-policy'),
      tenantId: id('test-tenant-id'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('test-rule'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: expenseAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Business expense'
                  },
                  {
                    accountId: cashAccount.id,
                    side: 'CREDIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Cash payment'
                  }
                ]
              }
            }
          }
        ]
      },
      createdAt: new Date()
    };

    // Create a test business event
    const event = createBusinessEvent({
      eventType: 'PURCHASE',
      amount: 7800,
      currency: 'INR',
      tenantId: id('test-tenant-id'),
      occurredAt: new Date()
    });

    // Generate journal using the accounting engine
    const journal = await accountingEngine.generateJournal(event, policyVersion);

    expect(journal.lines.length).toBe(2);
    expect(journal.lines[0].accountId).toBe(expenseAccount.id);
    expect(journal.lines[0].debit).toBe(7800);
    expect(journal.lines[0].credit).toBe(0);
    expect(journal.lines[1].accountId).toBe(cashAccount.id);
    expect(journal.lines[1].debit).toBe(0);
    expect(journal.lines[1].credit).toBe(7800);
  });

  it('should correctly process a four-line treatment (complex expense)', async () => {
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

    // Create a policy version with a four-line treatment
    const policyVersion: PolicyVersion = {
      id: id('test-policy-version'),
      policyId: id('test-policy'),
      tenantId: id('test-tenant-id'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('test-rule'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: travelAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Travel portion'
                  },
                  {
                    accountId: entertainmentAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Entertainment portion'
                  },
                  {
                    accountId: taxAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Tax portion'
                  },
                  {
                    accountId: creditCardAccount.id,
                    side: 'CREDIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Credit card payment'
                  }
                ]
              }
            }
          }
        ]
      },
      createdAt: new Date()
    };

    // Create a test business event
    const event = createBusinessEvent({
      eventType: 'PURCHASE',
      amount: 9000,
      currency: 'INR',
      tenantId: id('test-tenant-id'),
      occurredAt: new Date()
    });

    // Generate journal using the accounting engine
    const journal = await accountingEngine.generateJournal(event, policyVersion);

    expect(journal.lines.length).toBe(4);

    // Find lines by account ID
    const travelLine = journal.lines.find(l => l.accountId === travelAccount.id);
    const entertainmentLine = journal.lines.find(l => l.accountId === entertainmentAccount.id);
    const taxLine = journal.lines.find(l => l.accountId === taxAccount.id);
    const creditCardLine = journal.lines.find(l => l.accountId === creditCardAccount.id);

    // Verify debit lines
    expect(travelLine?.debit).toBe(9000);
    expect(entertainmentLine?.debit).toBe(9000);
    expect(taxLine?.debit).toBe(9000);

    // Verify credit line
    expect(creditCardLine?.credit).toBe(9000);

    // Verify all other amounts are zero
    expect(travelLine?.credit).toBe(0);
    expect(entertainmentLine?.credit).toBe(0);
    expect(taxLine?.credit).toBe(0);
    expect(creditCardLine?.debit).toBe(0);
  });

  it('should handle fixed amount treatments correctly', async () => {
    // Set up test accounts
    const expenseAccount = createAccount({
      id: id('expense-account-id'),
      tenantId: id('test-tenant-id'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const cashAccount = createAccount({
      id: id('cash-account-id'),
      tenantId: id('test-tenant-id'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    accountRepository.add(expenseAccount);
    accountRepository.add(cashAccount);

    // Create a policy version with fixed and event amount treatments
    const policyVersion: PolicyVersion = {
      id: id('test-policy-version'),
      policyId: id('test-policy'),
      tenantId: id('test-tenant-id'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('test-rule'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: expenseAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'FIXED_AMOUNT', value: 500, currency: 'INR' },
                    description: 'Fixed fee'
                  },
                  {
                    accountId: cashAccount.id,
                    side: 'CREDIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Remaining payment'
                  }
                ]
              }
            }
          }
        ]
      },
      createdAt: new Date()
    };

    // Create a test business event
    const event = createBusinessEvent({
      eventType: 'PURCHASE',
      amount: 1000, // Total event amount
      currency: 'INR',
      tenantId: id('test-tenant-id'),
      occurredAt: new Date()
    });

    // Generate journal using the accounting engine
    const journal = await accountingEngine.generateJournal(event, policyVersion);

    expect(journal.lines.length).toBe(2);
    expect(journal.lines[0].accountId).toBe(expenseAccount.id);
    expect(journal.lines[0].debit).toBe(500); // Fixed amount
    expect(journal.lines[0].credit).toBe(0);
    expect(journal.lines[1].accountId).toBe(cashAccount.id);
    expect(journal.lines[1].debit).toBe(0);
    expect(journal.lines[1].credit).toBe(1000); // Event amount
  });

  it('should preserve line order from treatment to journal', async () => {
    // Set up test accounts
    const firstAccount = createAccount({
      id: id('first-account-id'),
      tenantId: id('test-tenant-id'),
      code: '3000',
      name: 'First Account',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const secondAccount = createAccount({
      id: id('second-account-id'),
      tenantId: id('test-tenant-id'),
      code: '3010',
      name: 'Second Account',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const thirdAccount = createAccount({
      id: id('third-account-id'),
      tenantId: id('test-tenant-id'),
      code: '3020',
      name: 'Third Account',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    accountRepository.add(firstAccount);
    accountRepository.add(secondAccount);
    accountRepository.add(thirdAccount);

    // Create a policy version with ordered treatment lines
    const policyVersion: PolicyVersion = {
      id: id('test-policy-version'),
      policyId: id('test-policy'),
      tenantId: id('test-tenant-id'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('test-rule'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: firstAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' }
                  },
                  {
                    accountId: secondAccount.id,
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' }
                  },
                  {
                    accountId: thirdAccount.id,
                    side: 'CREDIT' as const,
                    amount: { type: 'EVENT_AMOUNT' }
                  }
                ]
              }
            }
          }
        ]
      },
      createdAt: new Date()
    };

    // Create a test business event
    const event = createBusinessEvent({
      eventType: 'PURCHASE',
      amount: 3000,
      currency: 'INR',
      tenantId: id('test-tenant-id'),
      occurredAt: new Date()
    });

    // Generate journal using the accounting engine
    const journal = await accountingEngine.generateJournal(event, policyVersion);

    expect(journal.lines.length).toBe(3);
    expect(journal.lines[0].accountId).toBe(firstAccount.id);
    expect(journal.lines[1].accountId).toBe(secondAccount.id);
    expect(journal.lines[2].accountId).toBe(thirdAccount.id);
  });
});