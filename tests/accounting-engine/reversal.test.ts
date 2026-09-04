// Tests for accounting engine reversal functionality

describe('Accounting Engine - Reversal', () => {
  // Mock journal structure
  type Journal = {
    id: string;
    tenantId: string;
    businessEventId: string;
    accountingTransactionId: string;
    policyVersionId: string | null;
    ruleId: string | null;
    transactionDate: Date;
    currency: string;
    description: string;
    lines: {
      id: string;
      journalId: string;
      accountId: string;
      debit: number;
      credit: number;
      currency: string;
      description?: string;
    }[];
    status: 'DRAFT' | 'POSTED' | 'REVERSED';
    createdAt: Date;
    postedAt?: Date;
  };

  // Mock reversal result
  type ReversalResult = {
    status: 'SUCCESS' | 'JOURNAL_NOT_FOUND' | 'JOURNAL_NOT_POSTED' | 'ALREADY_REVERSED' | 'REVERSAL_FAILED';
    reversalJournalId: string | null;
    originalJournalId: string;
    message: string;
  };

  // Mock function to create a reversal journal
  const createReversalJournal = (originalJournal: Journal): Journal => {
    const reversalLines = originalJournal.lines.map(line => ({
      id: `reversal-${line.id}`,
      journalId: `reversal-${originalJournal.id}`,
      accountId: line.accountId,
      debit: line.credit, // Swap debit and credit
      credit: line.debit, // Swap debit and credit
      currency: line.currency,
      description: line.description ? `Reversal: ${line.description}` : undefined
    }));

    return {
      id: `reversal-${originalJournal.id}`,
      tenantId: originalJournal.tenantId,
      businessEventId: originalJournal.businessEventId,
      accountingTransactionId: `${originalJournal.accountingTransactionId}-reversal`,
      policyVersionId: originalJournal.policyVersionId,
      ruleId: originalJournal.ruleId,
      transactionDate: originalJournal.transactionDate,
      currency: originalJournal.currency,
      description: `Reversal of ${originalJournal.description}`,
      lines: reversalLines,
      status: 'POSTED' as const,
      createdAt: new Date(),
      postedAt: new Date()
    };
  };

  // Mock function to reverse a journal
  const reverseJournal = (journalId: string, journals: Map<string, Journal>, reason: string): ReversalResult => {
    const journal = journals.get(journalId);

    if (!journal) {
      return {
        status: 'JOURNAL_NOT_FOUND',
        reversalJournalId: null,
        originalJournalId: journalId,
        message: 'Journal not found'
      };
    }

    if (journal.status === 'REVERSED') {
      return {
        status: 'ALREADY_REVERSED',
        reversalJournalId: null,
        originalJournalId: journalId,
        message: 'Journal has already been reversed'
      };
    }

    if (journal.status !== 'POSTED') {
      return {
        status: 'JOURNAL_NOT_POSTED',
        reversalJournalId: null,
        originalJournalId: journalId,
        message: 'Only posted journals can be reversed'
      };
    }

    // Create reversal journal
    const reversalJournal = createReversalJournal(journal);

    // Mark original as reversed (in a real system, we'd keep it immutable and just mark it)
    journal.status = 'REVERSED';
    journals.set(journalId, journal);

    // Store the reversal journal
    journals.set(reversalJournal.id, reversalJournal);

    return {
      status: 'SUCCESS',
      reversalJournalId: reversalJournal.id,
      originalJournalId: journalId,
      message: 'Journal reversed successfully'
    };
  };

  const setupTestJournal = (): Journal => {
    return {
      id: 'journal-123',
      tenantId: 'tenant-1',
      businessEventId: 'event-123',
      accountingTransactionId: 'txn-123',
      policyVersionId: 'pv-123',
      ruleId: 'rule-123',
      transactionDate: new Date('2026-09-03'),
      currency: 'INR',
      description: 'Original business transaction',
      lines: [
        {
          id: 'line-1',
          journalId: 'journal-123',
          accountId: 'acc-expenses',
          debit: 7800,
          credit: 0,
          currency: 'INR',
          description: 'Business Meals Expense'
        },
        {
          id: 'line-2',
          journalId: 'journal-123',
          accountId: 'acc-cash',
          debit: 0,
          credit: 7800,
          currency: 'INR',
          description: 'Cash Payment'
        }
      ],
      status: 'POSTED' as const,
      createdAt: new Date('2026-09-03T10:00:00Z'),
      postedAt: new Date('2026-09-03T10:00:00Z')
    };
  };

  it('should successfully reverse a posted journal', () => {
    const journals = new Map<string, Journal>();
    const originalJournal = setupTestJournal();
    journals.set(originalJournal.id, originalJournal);

    const result = reverseJournal(originalJournal.id, journals, 'Test reversal');

    expect(result.status).toBe('SUCCESS');
    expect(result.reversalJournalId).not.toBeNull();
    expect(result.originalJournalId).toBe('journal-123');
    expect(result.message).toBe('Journal reversed successfully');

    // Verify original journal is marked as reversed
    const reversedOriginal = journals.get('journal-123');
    expect(reversedOriginal?.status).toBe('REVERSED');

    // Verify reversal journal exists and is posted
    const reversalJournal = journals.get(result.reversalJournalId!);
    expect(reversalJournal).not.toBeNull();
    expect(reversalJournal?.status).toBe('POSTED');
    expect(reversalJournal?.description).toContain('Reversal of');
  });

  it('should correctly swap debits and credits in reversal journal', () => {
    const journals = new Map<string, Journal>();
    const originalJournal = setupTestJournal();
    journals.set(originalJournal.id, originalJournal);

    const result = reverseJournal(originalJournal.id, journals, 'Test reversal');
    const reversalJournal = journals.get(result.reversalJournalId!)!;

    // Original: DR Expenses 7800, CR Cash 7800
    // Reversal: DR Cash 7800, CR Expenses 7800

    const reversalExpenseLine = reversalJournal.lines.find(l => l.accountId === 'acc-expenses');
    const reversalCashLine = reversalJournal.lines.find(l => l.accountId === 'acc-cash');

    expect(reversalExpenseLine?.debit).toBe(0); // Was 7800 debit, now 0
    expect(reversalExpenseLine?.credit).toBe(7800); // Was 0 credit, now 7800

    expect(reversalCashLine?.debit).toBe(7800); // Was 0 debit, now 7800
    expect(reversalCashLine?.credit).toBe(0); // Was 7800 credit, now 0
  });

  it('should reject reversal of non-existent journal', () => {
    const journals = new Map<string, Journal>();

    const result = reverseJournal('non-existent-journal', journals, 'Test reversal');

    expect(result.status).toBe('JOURNAL_NOT_FOUND');
    expect(result.reversalJournalId).toBeNull();
    expect(result.originalJournalId).toBe('non-existent-journal');
    expect(result.message).toBe('Journal not found');
  });

  it('should reject reversal of unposted journal', () => {
    const journals = new Map<string, Journal>();
    const originalJournal = setupTestJournal();
    originalJournal.status = 'DRAFT' as const; // Make it unposted
    journals.set(originalJournal.id, originalJournal);

    const result = reverseJournal(originalJournal.id, journals, 'Test reversal');

    expect(result.status).toBe('JOURNAL_NOT_POSTED');
    expect(result.reversalJournalId).toBeNull();
    expect(result.originalJournalId).toBe('journal-123');
    expect(result.message).toBe('Only posted journals can be reversed');
  });

  it('should reject reversal of already reversed journal', () => {
    const journals = new Map<string, Journal>();
    const originalJournal = setupTestJournal();
    originalJournal.status = 'REVERSED' as const; // Already reversed
    journals.set(originalJournal.id, originalJournal);

    const result = reverseJournal(originalJournal.id, journals, 'Test reversal');

    expect(result.status).toBe('ALREADY_REVERSED');
    expect(result.reversalJournalId).toBeNull();
    expect(result.originalJournalId).toBe('journal-123');
    expect(result.message).toBe('Journal has already been reversed');
  });

  it('should preserve audit trail in reversal', () => {
    const journals = new Map<string, Journal>();
    const originalJournal = setupTestJournal();
    journals.set(originalJournal.id, originalJournal);

    const result = reverseJournal(originalJournal.id, journals, 'Test reversal');
    const reversalJournal = journals.get(result.reversalJournalId!)!;

    // Verify reversal journal references original
    expect(reversalJournal.businessEventId).toBe(originalJournal.businessEventId);
    expect(reversalJournal.accountingTransactionId).toContain('-reversal');
    expect(reversalJournal.description).toContain(`Reversal of ${originalJournal.description}`);

    // Verify line-level audit trail
    const originalExpenseLine = originalJournal.lines.find(l => l.accountId === 'acc-expenses');
    const reversalExpenseLine = reversalJournal.lines.find(l => l.accountId === 'acc-expenses');

    expect(reversalExpenseLine?.description).toContain(`Reversal: ${originalExpenseLine?.description}`);
  });
});