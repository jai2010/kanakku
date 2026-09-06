import { id } from '../fixtures/ids';
import { Account, createAccount } from '../../src/domain/accounting/Account';
import { createJournal } from '../../src/domain/accounting/Journal';
import { createJournalLine } from '../../src/domain/accounting/JournalLine';
import { createPostedJournal } from '../../src/domain/accounting/PostedJournal';
import {
  accumulateAccountBalance,
  deriveAccountBalances,
  deriveJournalBalanceImpact,
  deriveLedgerTotals,
  deriveTrialBalance,
  displayBalance,
  ledgerEntriesFromPostedJournals,
  normalBalanceSide,
  runningAccountLedger,
  signedDelta
} from '../../src/domain/ledger';

function account(code: string, type: Account['type'], name?: string): Account {
  return createAccount({
    id: id(`acc-${code}`),
    tenantId: id('tenant-1'),
    code,
    name: name ?? code,
    type,
    status: 'ACTIVE'
  });
}

function posted(input: {
  id: string;
  date: string;
  lines: Array<{ accountId: string; debit?: number; credit?: number }>;
  description?: string;
  status?: 'POSTED' | 'REVERSED';
  postedAt?: Date;
}) {
  const journalId = id(input.id);
  const journal = createJournal({
    id: journalId,
    tenantId: id('tenant-1'),
    businessEventId: id(`evt-${input.id}`),
    accountingTransactionId: id(`txn-${input.id}`),
    transactionDate: new Date(input.date),
    currency: 'INR',
    description: input.description ?? 'Test journal',
    status: 'POSTED',
    lines: input.lines.map((line, index) => createJournalLine({
      id: id(`${input.id}-line-${index}`),
      journalId,
      accountId: line.accountId,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      currency: 'INR',
      description: input.description
    }))
  });
  const postedJournal = createPostedJournal(journal, id('user-1'));
  return {
    ...postedJournal,
    status: input.status ?? 'POSTED',
    postedAt: input.postedAt ?? postedJournal.postedAt
  };
}

describe('normal balance semantics', () => {
  it('treats asset and expense as debit-normal', () => {
    expect(normalBalanceSide('ASSET')).toBe('DEBIT');
    expect(normalBalanceSide('EXPENSE')).toBe('DEBIT');
    expect(signedDelta(100, 0, 'ASSET')).toBe(100);
    expect(signedDelta(0, 40, 'EXPENSE')).toBe(-40);
  });

  it('treats liability, equity and income as credit-normal', () => {
    expect(normalBalanceSide('LIABILITY')).toBe('CREDIT');
    expect(normalBalanceSide('EQUITY')).toBe('CREDIT');
    expect(normalBalanceSide('INCOME')).toBe('CREDIT');
    expect(signedDelta(0, 100, 'LIABILITY')).toBe(100);
    expect(signedDelta(25, 0, 'INCOME')).toBe(-25);
  });

  it('does not add debit and subtract credit universally', () => {
    expect(signedDelta(50, 0, 'LIABILITY')).toBe(-50);
    expect(signedDelta(0, 50, 'ASSET')).toBe(-50);
  });

  it('reports contra balances on the opposite side', () => {
    expect(displayBalance(-200, 'ASSET')).toEqual({ balance: 200, balanceSide: 'CREDIT' });
    expect(displayBalance(-15, 'INCOME')).toEqual({ balance: 15, balanceSide: 'DEBIT' });
    expect(displayBalance(0, 'EXPENSE')).toEqual({ balance: 0, balanceSide: 'DEBIT' });
  });
});

describe('derived ledger balances', () => {
  const meals = account('5220', 'EXPENSE', 'Business Meals');
  const card = account('2000', 'LIABILITY', 'Corporate Card');
  const cash = account('1010', 'ASSET', 'Cash');
  const software = account('6100', 'EXPENSE', 'Software Expense');
  const payable = account('2100', 'LIABILITY', 'Accounts Payable');
  const accounts = [meals, card, cash, software, payable];

  it('computes running balances in posting order', () => {
    const journals = [
      posted({
        id: 'jn-1',
        date: '2026-09-05T10:00:00.000Z',
        description: 'Starbucks',
        postedAt: new Date('2026-09-05T10:00:00.000Z'),
        lines: [
          { accountId: meals.id, debit: 7800 },
          { accountId: card.id, credit: 7800 }
        ]
      }),
      posted({
        id: 'jn-2',
        date: '2026-09-05T12:00:00.000Z',
        description: 'Starbucks',
        postedAt: new Date('2026-09-05T12:00:00.000Z'),
        lines: [
          { accountId: meals.id, debit: 2400 },
          { accountId: card.id, credit: 2400 }
        ]
      }),
      posted({
        id: 'jn-3',
        date: '2026-09-06T09:00:00.000Z',
        description: 'Refund',
        postedAt: new Date('2026-09-06T09:00:00.000Z'),
        lines: [
          { accountId: meals.id, credit: 800 },
          { accountId: card.id, debit: 800 }
        ]
      })
    ];
    const entries = ledgerEntriesFromPostedJournals(journals);
    const ledger = runningAccountLedger(meals, entries, 'INR');
    expect(ledger.entries.map((line) => line.runningBalance)).toEqual([7800, 10200, 9400]);
    expect(ledger.entries.map((line) => line.runningBalanceSide)).toEqual(['DEBIT', 'DEBIT', 'DEBIT']);
    expect(ledger.balance).toBe(9400);
    expect(ledger.balanceSide).toBe('DEBIT');

    const cardLedger = runningAccountLedger(card, entries, 'INR');
    expect(cardLedger.entries.map((line) => line.runningBalance)).toEqual([7800, 10200, 9400]);
    expect(cardLedger.balanceSide).toBe('CREDIT');
  });

  it('keeps reversed originals in the ledger so reversals net to zero', () => {
    const original = posted({
      id: 'jn-orig',
      date: '2026-09-05T10:00:00.000Z',
      postedAt: new Date('2026-09-05T10:00:00.000Z'),
      status: 'REVERSED',
      lines: [
        { accountId: meals.id, debit: 7800 },
        { accountId: card.id, credit: 7800 }
      ]
    });
    const reversal = posted({
      id: 'jn-rev',
      date: '2026-09-05T10:00:00.000Z',
      postedAt: new Date('2026-09-05T11:00:00.000Z'),
      lines: [
        { accountId: meals.id, credit: 7800 },
        { accountId: card.id, debit: 7800 }
      ]
    });
    const entries = ledgerEntriesFromPostedJournals([original, reversal]);
    expect(accumulateAccountBalance(meals, entries, 'INR').balance).toBe(0);
    expect(accumulateAccountBalance(card, entries, 'INR').balance).toBe(0);
  });

  it('builds a balanced trial balance from net account sides', () => {
    const journals = [
      posted({
        id: 'jn-meals',
        date: '2026-09-05',
        lines: [
          { accountId: meals.id, debit: 7800 },
          { accountId: card.id, credit: 7800 }
        ]
      }),
      posted({
        id: 'jn-aws',
        date: '2026-09-05',
        lines: [
          { accountId: software.id, debit: 82400 },
          { accountId: payable.id, credit: 82400 }
        ]
      })
    ];
    const entries = ledgerEntriesFromPostedJournals(journals);
    const trial = deriveTrialBalance(accounts, entries, id('tenant-1'), new Date('2026-09-05'), 'INR');
    expect(trial.totalDebits).toBe(90200);
    expect(trial.totalCredits).toBe(90200);
    expect(trial.balanced).toBe(true);
    expect(trial.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: meals.id, debit: 7800, credit: 0 }),
      expect.objectContaining({ accountId: software.id, debit: 82400, credit: 0 }),
      expect.objectContaining({ accountId: card.id, debit: 0, credit: 7800 }),
      expect.objectContaining({ accountId: payable.id, debit: 0, credit: 82400 })
    ]));
    expect(trial.lines.find((line) => line.accountId === cash.id)).toBeUndefined();
  });

  it('omits journals after the as-of date', () => {
    const journals = [
      posted({
        id: 'jn-early',
        date: '2026-09-01T00:00:00.000Z',
        lines: [
          { accountId: meals.id, debit: 100 },
          { accountId: card.id, credit: 100 }
        ]
      }),
      posted({
        id: 'jn-late',
        date: '2026-09-10T00:00:00.000Z',
        lines: [
          { accountId: meals.id, debit: 50 },
          { accountId: card.id, credit: 50 }
        ]
      })
    ];
    const entries = ledgerEntriesFromPostedJournals(journals).filter((entry) =>
      entry.transactionDate.getTime() <= new Date('2026-09-05T00:00:00.000Z').getTime()
    );
    expect(accumulateAccountBalance(meals, entries, 'INR').balance).toBe(100);
  });

  it('derives type totals and gross movement without mutating accounts', () => {
    const journals = [
      posted({
        id: 'jn-meals',
        date: '2026-09-05',
        lines: [
          { accountId: meals.id, debit: 7800 },
          { accountId: card.id, credit: 7800 }
        ]
      })
    ];
    const entries = ledgerEntriesFromPostedJournals(journals);
    const balances = deriveAccountBalances(accounts, entries, 'INR');
    const totals = deriveLedgerTotals(accounts, balances, entries);
    expect(totals.totalDebits).toBe(7800);
    expect(totals.totalCredits).toBe(7800);
    expect(totals.balanced).toBe(true);
    expect(totals.typeTotals.find((row) => row.type === 'EXPENSE')).toEqual({
      type: 'EXPENSE',
      balance: 7800,
      balanceSide: 'DEBIT'
    });
    expect(totals.typeTotals.find((row) => row.type === 'LIABILITY')).toEqual({
      type: 'LIABILITY',
      balance: 7800,
      balanceSide: 'CREDIT'
    });
    expect(meals).not.toHaveProperty('balance');
  });

  it('reports previous and next balances for a posted journal', () => {
    const first = posted({
      id: 'jn-1',
      date: '2026-09-05T10:00:00.000Z',
      postedAt: new Date('2026-09-05T10:00:00.000Z'),
      lines: [
        { accountId: meals.id, debit: 7800 },
        { accountId: card.id, credit: 7800 }
      ]
    });
    const second = posted({
      id: 'jn-2',
      date: '2026-09-05T11:00:00.000Z',
      postedAt: new Date('2026-09-05T11:00:00.000Z'),
      lines: [
        { accountId: meals.id, debit: 2400 },
        { accountId: card.id, credit: 2400 }
      ]
    });
    const entries = ledgerEntriesFromPostedJournals([first, second]);
    const impact = deriveJournalBalanceImpact(accounts, entries, second.id);
    expect(impact).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountId: meals.id,
        debit: 2400,
        credit: 0,
        previousBalance: 7800,
        previousBalanceSide: 'DEBIT',
        nextBalance: 10200,
        nextBalanceSide: 'DEBIT'
      }),
      expect.objectContaining({
        accountId: card.id,
        debit: 0,
        credit: 2400,
        previousBalance: 7800,
        previousBalanceSide: 'CREDIT',
        nextBalance: 10200,
        nextBalanceSide: 'CREDIT'
      })
    ]));
  });
});
