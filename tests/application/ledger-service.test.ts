import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { LedgerService } from '../../src/application/accounting/LedgerService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';

describe('LedgerService', () => {
  const tenantA = id('tenant-a');
  const tenantB = id('tenant-b');
  let accounts: InMemoryAccountRepository;
  let journals: InMemoryJournalRepository;
  let policies: InMemoryPolicyVersionRepository;
  let accounting: AccountingService;
  let ledger: LedgerService;

  beforeEach(() => {
    accounts = new InMemoryAccountRepository();
    journals = new InMemoryJournalRepository();
    policies = new InMemoryPolicyVersionRepository();
    accounting = new AccountingService({
      policyVersionRepository: policies,
      accountRepository: accounts,
      journalRepository: journals
    });
    ledger = new LedgerService({
      accountRepository: accounts,
      journalRepository: journals
    });

    for (const tenant of [tenantA, tenantB]) {
      accounts.add(createAccount({
        id: id(`${tenant}-meals`),
        tenantId: tenant,
        code: '5220',
        name: 'Business Meals',
        type: 'EXPENSE'
      }));
      accounts.add(createAccount({
        id: id(`${tenant}-card`),
        tenantId: tenant,
        code: '2000',
        name: 'Corporate Card',
        type: 'LIABILITY'
      }));
      accounts.add(createAccount({
        id: id(`${tenant}-cash`),
        tenantId: tenant,
        code: '1010',
        name: 'Cash',
        type: 'ASSET'
      }));
      policies.add(createPolicyVersion({
        id: id(`${tenant}-pv`),
        policyId: id(`${tenant}-pol`),
        tenantId: tenant,
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        definition: {
          rules: [
            {
              id: id(`${tenant}-rule`),
              priority: 100,
              when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
              then: {
                treatment: {
                  lines: [
                    { accountId: id(`${tenant}-meals`), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Meals' },
                    { accountId: id(`${tenant}-card`), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Card' }
                  ]
                }
              }
            }
          ]
        }
      }));
    }
  });

  afterEach(() => {
    accounts.clear();
    journals.clear();
    policies.clear();
  });

  async function purchase(tenantId: string, amount: number, eventId: string, occurredAt = new Date('2026-09-05T10:00:00.000Z')) {
    return accounting.processEvent(createBusinessEvent({
      id: eventId,
      tenantId,
      eventType: 'PURCHASE',
      occurredAt,
      amount,
      currency: 'INR',
      counterparty: 'Starbucks',
      source: 'API'
    }));
  }

  it('derives account balances from posted journals without storing them on Account', async () => {
    await purchase(tenantA, 7800, id('evt-1'));
    const balances = await ledger.getAccountBalances({ tenantId: tenantA });
    const meals = balances.find((row) => row.accountId === id(`${tenantA}-meals`));
    const card = balances.find((row) => row.accountId === id(`${tenantA}-card`));
    const cash = balances.find((row) => row.accountId === id(`${tenantA}-cash`));
    expect(meals).toMatchObject({ totalDebits: 7800, totalCredits: 0, balance: 7800, balanceSide: 'DEBIT' });
    expect(card).toMatchObject({ totalDebits: 0, totalCredits: 7800, balance: 7800, balanceSide: 'CREDIT' });
    expect(cash).toMatchObject({ balance: 0, balanceSide: 'DEBIT' });
    expect(accounts.getAccount(id(`${tenantA}-meals`))).resolves.not.toHaveProperty('balance');
  });

  it('builds an account ledger with a running balance per line', async () => {
    await purchase(tenantA, 7800, id('evt-1'), new Date('2026-09-05T10:00:00.000Z'));
    await purchase(tenantA, 2400, id('evt-2'), new Date('2026-09-05T12:00:00.000Z'));
    const accountLedger = await ledger.getAccountLedger(tenantA, id(`${tenantA}-meals`));
    expect(accountLedger?.entries.map((line) => ({ debit: line.debit, credit: line.credit, runningBalance: line.runningBalance }))).toEqual([
      { debit: 7800, credit: 0, runningBalance: 7800 },
      { debit: 2400, credit: 0, runningBalance: 10200 }
    ]);
    expect(accountLedger?.balance).toBe(10200);
    expect(accountLedger?.balanceSide).toBe('DEBIT');
  });

  it('returns a balanced trial balance and ledger totals', async () => {
    await purchase(tenantA, 7800, id('evt-1'));
    const trial = await ledger.getTrialBalance({ tenantId: tenantA });
    const totals = await ledger.getLedgerTotals({ tenantId: tenantA });
    expect(trial.balanced).toBe(true);
    expect(trial.totalDebits).toBe(7800);
    expect(trial.totalCredits).toBe(7800);
    expect(totals.balanced).toBe(true);
    expect(totals.totalDebits).toBe(7800);
    expect(totals.totalCredits).toBe(7800);
    expect(totals.accountCount).toBe(3);
  });

  it('isolates tenants', async () => {
    await purchase(tenantA, 7800, id('evt-a'));
    await purchase(tenantB, 500, id('evt-b'));
    const a = await ledger.getAccountBalance(tenantA, id(`${tenantA}-meals`));
    const b = await ledger.getAccountBalance(tenantB, id(`${tenantB}-meals`));
    const cross = await ledger.getAccountBalance(tenantA, id(`${tenantB}-meals`));
    expect(a?.balance).toBe(7800);
    expect(b?.balance).toBe(500);
    expect(cross).toBeNull();
    expect((await ledger.getPostedJournals(tenantA)).every((journal) => journal.tenantId === tenantA)).toBe(true);
  });

  it('includes original and reversal lines so the account nets to zero', async () => {
    const posted = await purchase(tenantA, 7800, id('evt-1'));
    expect(posted.postedJournal).toBeDefined();
    await accounting.reverseJournal(posted.postedJournal!.id, 'correction', tenantA);
    const accountLedger = await ledger.getAccountLedger(tenantA, id(`${tenantA}-meals`));
    expect(accountLedger?.entries).toHaveLength(2);
    expect(accountLedger?.balance).toBe(0);
    const trial = await ledger.getTrialBalance({ tenantId: tenantA });
    expect(trial.lines.find((line) => line.accountId === id(`${tenantA}-meals`))).toBeUndefined();
    expect(trial.balanced).toBe(true);
  });

  it('does not expose another tenant journal by id', async () => {
    const posted = await purchase(tenantB, 500, id('evt-b'));
    const stolen = await ledger.getPostedJournal(tenantA, posted.postedJournal!.id);
    expect(stolen).toBeNull();
  });

  it('returns journal balance impact from posted lines', async () => {
    const first = await purchase(tenantA, 7800, id('evt-1'));
    const second = await purchase(tenantA, 2400, id('evt-2'));
    const impact = await ledger.getJournalBalanceImpact(tenantA, second.postedJournal!.id);
    expect(impact).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountId: id(`${tenantA}-meals`),
        previousBalance: 7800,
        nextBalance: 10200
      })
    ]));
    expect(first.postedJournal?.status).toBe('POSTED');
  });
});
