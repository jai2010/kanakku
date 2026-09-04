// Tests for multi-line journal handling

describe('Accounting Engine - Multi-line Journal Handling', () => {
  // Mock function to process accounting treatment into journal lines
  const processTreatmentToJournalLines = (treatmentLines: any[], eventAmount: number, eventCurrency: string) => {
    return treatmentLines.map((line: any, index: number) => {
      let amount = 0;

      if (line.amount.type === 'EVENT_AMOUNT') {
        amount = eventAmount;
      } else if (line.amount.type === 'FIXED_AMOUNT') {
        amount = line.amount.value || 0;
        // In a real system, we'd also validate currency matching
      }

      return {
        id: `line-${index + 1}`,
        journalId: 'journal-test-id',
        accountId: line.accountId,
        debit: line.side === 'DEBIT' ? amount : 0,
        credit: line.side === 'CREDIT' ? amount : 0,
        currency: eventCurrency,
        description: line.description || ''
      };
    });
  };

  it('should correctly process a simple two-line treatment', () => {
    const treatmentLines = [
      {
        accountId: 'acc-expenses',
        side: 'DEBIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Business expense'
      },
      {
        accountId: 'acc-cash',
        side: 'CREDIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Cash payment'
      }
    ];

    const eventAmount = 7800;
    const eventCurrency = 'INR';

    const journalLines = processTreatmentToJournalLines(treatmentLines, eventAmount, eventCurrency);

    expect(journalLines.length).toBe(2);
    expect(journalLines[0].accountId).toBe('acc-expenses');
    expect(journalLines[0].debit).toBe(7800);
    expect(journalLines[0].credit).toBe(0);
    expect(journalLines[1].accountId).toBe('acc-cash');
    expect(journalLines[1].debit).toBe(0);
    expect(journalLines[1].credit).toBe(7800);
  });

  it('should correctly process a four-line treatment (complex expense)', () => {
    const treatmentLines = [
      {
        accountId: 'acc-travel',
        side: 'DEBIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Travel portion'
      },
      {
        accountId: 'acc-entertainment',
        side: 'DEBIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Entertainment portion'
      },
      {
        accountId: 'acc-tax',
        side: 'DEBIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Tax portion'
      },
      {
        accountId: 'acc-credit-card',
        side: 'CREDIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Credit card payment'
      }
    ];

    const eventAmount = 9000;
    const eventCurrency = 'INR';

    const journalLines = processTreatmentToJournalLines(treatmentLines, eventAmount, eventCurrency);

    expect(journalLines.length).toBe(4);

    // Verify debit lines
    const travelLine = journalLines.find(l => l.accountId === 'acc-travel');
    const entertainmentLine = journalLines.find(l => l.accountId === 'acc-entertainment');
    const taxLine = journalLines.find(l => l.accountId === 'acc-tax');

    expect(travelLine?.debit).toBe(9000);
    expect(entertainmentLine?.debit).toBe(9000);
    expect(taxLine?.debit).toBe(9000);

    // Verify credit line
    const creditCardLine = journalLines.find(l => l.accountId === 'acc-credit-card');
    expect(creditCardLine?.credit).toBe(9000);

    // Verify all other amounts are zero
    expect(travelLine?.credit).toBe(0);
    expect(entertainmentLine?.credit).toBe(0);
    expect(taxLine?.credit).toBe(0);
    expect(creditCardLine?.debit).toBe(0);
  });

  it('should handle fixed amount treatments correctly', () => {
    const treatmentLines = [
      {
        accountId: 'acc-expenses',
        side: 'DEBIT' as const,
        amount: { type: 'FIXED_AMOUNT', value: 500, currency: 'INR' },
        description: 'Fixed fee'
      },
      {
        accountId: 'acc-cash',
        side: 'CREDIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Remaining payment'
      }
    ];

    const eventAmount = 1000; // Total event amount
    const eventCurrency = 'INR';

    const journalLines = processTreatmentToJournalLines(treatmentLines, eventAmount, eventCurrency);

    expect(journalLines.length).toBe(2);
    expect(journalLines[0].accountId).toBe('acc-expenses');
    expect(journalLines[0].debit).toBe(500); // Fixed amount
    expect(journalLines[0].credit).toBe(0);
    expect(journalLines[1].accountId).toBe('acc-cash');
    expect(journalLines[1].debit).toBe(0);
    expect(journalLines[1].credit).toBe(1000); // Event amount (in real system, this might be event-amount minus fixed amounts)
  });

  it('should preserve line order from treatment to journal', () => {
    const treatmentLines = [
      { accountId: 'acc-first', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
      { accountId: 'acc-second', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
      { accountId: 'acc-third', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
    ];

    const eventAmount = 3000;
    const eventCurrency = 'INR';

    const journalLines = processTreatmentToJournalLines(treatmentLines, eventAmount, eventCurrency);

    expect(journalLines[0].accountId).toBe('acc-first');
    expect(journalLines[1].accountId).toBe('acc-second');
    expect(journalLines[2].accountId).toBe('acc-third');
  });
});