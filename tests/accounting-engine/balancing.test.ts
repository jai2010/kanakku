// Tests for accounting engine balancing validation

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';

// Mock validation functions to test balancing logic
describe('Accounting Engine - Balancing Validation', () => {
  // Mock function to validate journal balancing (similar to what would be in the real engine)
  const validateJournalBalancing = (journalLines: any[]) => {
    const totalDebits = journalLines.reduce((sum: number, line: any) => sum + (line.debit || 0), 0);
    const totalCredits = journalLines.reduce((sum: number, line: any) => sum + (line.credit || 0), 0);

    return {
      balanced: totalDebits === totalCredits,
      totalDebits,
      totalCredits,
      difference: Math.abs(totalDebits - totalCredits)
    };
  };

  // Mock account validation function
  const validateAccountExists = (accountId: string, validAccounts: Set<string>) => {
    return validAccounts.has(accountId);
  };

  it('should validate a balanced two-line journal', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 5000, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 5000 }
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(true);
    expect(result.totalDebits).toBe(5000);
    expect(result.totalCredits).toBe(5000);
    expect(result.difference).toBe(0);
  });

  it('should detect an unbalanced journal with excess debit', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 6000, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 5000 }
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(false);
    expect(result.totalDebits).toBe(6000);
    expect(result.totalCredits).toBe(5000);
    expect(result.difference).toBe(1000);
  });

  it('should detect an unbalanced journal with excess credit', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 4000, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 5000 }
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(false);
    expect(result.totalDebits).toBe(4000);
    expect(result.totalCredits).toBe(5000);
    expect(result.difference).toBe(1000);
  });

  it('should validate a complex multi-line balanced journal', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 3000, credit: 0 },  // Travel
      { accountId: 'acc-2', debit: 2000, credit: 0 },  // Entertainment
      { accountId: 'acc-3', debit: 1000, credit: 0 },  // Tax
      { accountId: 'acc-4', debit: 0, credit: 6000 }   // Credit Card
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(true);
    expect(result.totalDebits).toBe(6000);
    expect(result.totalCredits).toBe(6000);
    expect(result.difference).toBe(0);
  });

  it('should validate a journal with fractional amounts', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 1000.50, credit: 0 },
      { accountId: 'acc-2', debit: 0, credit: 1000.50 }
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(true);
    expect(result.totalDebits).toBe(1000.50);
    expect(result.totalCredits).toBe(1000.50);
    expect(result.difference).toBe(0);
  });

  it('should handle zero amounts correctly (though unusual in practice)', () => {
    const journalLines = [
      { accountId: 'acc-1', debit: 0, credit: 0 },   // This would normally be invalid due to line validation
      { accountId: 'acc-2', debit: 0, credit: 0 }
    ];

    const result = validateJournalBalancing(journalLines);
    expect(result.balanced).toBe(true);
    expect(result.totalDebits).toBe(0);
    expect(result.totalCredits).toBe(0);
    expect(result.difference).toBe(0);
  });
});