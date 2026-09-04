// Tests for accounting engine journal generation

import { Journal } from '../../src/domain/accounting/Journal';
import { JournalLine } from '../../src/domain/accounting/JournalLine';
import { createAccount } from '../../src/domain/accounting/Account';

// Mock accounting engine for testing journal generation
describe('Accounting Engine - Journal Generation', () => {
  const createMockJournal = (lines: JournalLine[]): Journal => {
    // Validate that we have at least 2 lines for double-entry
    if (lines.length < 2) {
      throw new Error('Journal must have at least 2 lines');
    }

    // Validate that exactly one of debit/credit is > 0 for each line
    for (const line of lines) {
      const hasDebit = line.debit > 0;
      const hasCredit = line.credit > 0;
      if (!(hasDebit && !hasCredit) && !(hasDebit === false && hasCredit)) {
        throw new Error('Each journal line must have exactly one side (debit or credit) > 0');
      }
    }

    // Calculate totals for validation
    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

    if (totalDebits !== totalCredits) {
      throw new Error(`Journal not balanced: debits=${totalDebits}, credits=${totalCredits}`);
    }

    return {
      id: 'journal-test-id',
      tenantId: 'tenant-test',
      businessEventId: 'event-test-id',
      accountingTransactionId: 'txn-test-id',
      policyVersionId: 'pv-test-id',
      ruleId: 'rule-test-id',
      transactionDate: new Date('2026-09-03'),
      currency: 'INR',
      description: 'Test journal',
      lines,
      status: 'DRAFT' as const,
      createdAt: new Date()
    };
  };

  it('should generate a valid two-line journal entry', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-expenses',
        debit: 7800,
        credit: 0,
        currency: 'INR',
        description: 'Business Meals Expense'
      },
      {
        id: 'line-2',
        journalId: 'journal-test-id',
        accountId: 'acc-cash',
        debit: 0,
        credit: 7800,
        currency: 'INR',
        description: 'Cash Payment'
      }
    ];

    const journal = createMockJournal(lines);

    expect(journal.lines.length).toBe(2);
    expect(journal.lines[0].accountId).toBe('acc-expenses');
    expect(journal.lines[0].debit).toBe(7800);
    expect(journal.lines[0].credit).toBe(0);
    expect(journal.lines[1].accountId).toBe('acc-cash');
    expect(journal.lines[1].debit).toBe(0);
    expect(journal.lines[1].credit).toBe(7800);
    expect(journal.status).toBe('DRAFT');
  });

  it('should reject a journal with only one line', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-expenses',
        debit: 7800,
        credit: 0,
        currency: 'INR',
        description: 'Business Meals Expense'
      }
    ];

    expect(() => createMockJournal(lines)).toThrow('Journal must have at least 2 lines');
  });

  it('should reject a journal with both debit and credit > 0 on same line', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-expenses',
        debit: 5000,
        credit: 2000, // Invalid: both > 0
        currency: 'INR',
        description: 'Invalid line'
      },
      {
        id: 'line-2',
        journalId: 'journal-test-id',
        accountId: 'acc-cash',
        debit: 0,
        credit: 7800,
        currency: 'INR',
        description: 'Cash Payment'
      }
    ];

    expect(() => createMockJournal(lines)).toThrow('Each journal line must have exactly one side');
  });

  it('should reject a journal with both debit and credit = 0 on same line', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-expenses',
        debit: 0,
        credit: 0, // Invalid: neither > 0
        currency: 'INR',
        description: 'Invalid line'
      },
      {
        id: 'line-2',
        journalId: 'journal-test-id',
        accountId: 'acc-cash',
        debit: 0,
        credit: 7800,
        currency: 'INR',
        description: 'Cash Payment'
      }
    ];

    expect(() => createMockJournal(lines)).toThrow('Each journal line must have exactly one side');
  });

  it('should reject an unbalanced journal', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-expenses',
        debit: 7800,
        credit: 0,
        currency: 'INR',
        description: 'Business Meals Expense'
      },
      {
        id: 'line-2',
        journalId: 'journal-test-id',
        accountId: 'acc-cash',
        debit: 0,
        credit: 7500, // Not equal to debit above
        currency: 'INR',
        description: 'Cash Payment'
      }
    ];

    expect(() => createMockJournal(lines)).toThrow('Journal not balanced');
  });

  it('should handle multi-line journal entries correctly', () => {
    const lines: JournalLine[] = [
      {
        id: 'line-1',
        journalId: 'journal-test-id',
        accountId: 'acc-travel',
        debit: 6000,
        credit: 0,
        currency: 'INR',
        description: 'Travel Expense'
      },
      {
        id: 'line-2',
        journalId: 'journal-test-id',
        accountId: 'acc-entertainment',
        debit: 2000,
        credit: 0,
        currency: 'INR',
        description: 'Entertainment Expense'
      },
      {
        id: 'line-3',
        journalId: 'journal-test-id',
        accountId: 'acc-tax',
        debit: 1000,
        credit: 0,
        currency: 'INR',
        description: 'Input Tax Receivable'
      },
      {
        id: 'line-4',
        journalId: 'journal-test-id',
        accountId: 'acc-credit-card',
        debit: 0,
        credit: 9000,
        currency: 'INR',
        description: 'Credit Card Payable'
      }
    ];

    const journal = createMockJournal(lines);

    expect(journal.lines.length).toBe(4);

    // Verify debits
    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    expect(totalDebits).toBe(9000);

    // Verify credits
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(totalCredits).toBe(9000);

    // Verify specific accounts
    const travelLine = journal.lines.find(l => l.accountId === 'acc-travel');
    const entertainmentLine = journal.lines.find(l => l.accountId === 'acc-entertainment');
    const taxLine = journal.lines.find(l => l.accountId === 'acc-tax');
    const creditCardLine = journal.lines.find(l => l.accountId === 'acc-credit-card');

    expect(travelLine?.debit).toBe(6000);
    expect(entertainmentLine?.debit).toBe(2000);
    expect(taxLine?.debit).toBe(1000);
    expect(creditCardLine?.credit).toBe(9000);
  });
});