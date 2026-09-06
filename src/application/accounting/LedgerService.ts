import { Account } from '../../domain/accounting/Account';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import {
  AccountBalance,
  AccountBalanceImpact,
  AccountLedger,
  LedgerEntry,
  LedgerTotals,
  TrialBalance,
  deriveAccountBalances,
  deriveAccountLedger,
  deriveJournalBalanceImpact,
  deriveLedgerTotals,
  deriveTrialBalance,
  earliestActivityDate,
  entriesOnOrBefore,
  latestActivityDate,
  ledgerEntriesFromPostedJournals
} from '../../domain/ledger';

export interface LedgerServiceDependencies {
  accountRepository: {
    getAccount(id: string): Promise<Account | null>;
    findByTenantId(tenantId: string): Promise<Account[]>;
  };
  journalRepository: {
    getPostedJournal(id: string): Promise<PostedJournal | null>;
    findByTenantId(tenantId: string): Promise<PostedJournal[]>;
  };
}

export type LedgerQuery = {
  tenantId: string;
  asOf?: Date;
  functionalCurrency?: string;
};

/**
 * Read model over posted journals. Balances are always derived; posted
 * journals remain the source of truth and are never mutated here.
 */
export class LedgerService {
  private dependencies: LedgerServiceDependencies;

  constructor(dependencies: LedgerServiceDependencies) {
    this.dependencies = dependencies;
  }

  async getPostedJournals(tenantId: string): Promise<PostedJournal[]> {
    const journals = await this.dependencies.journalRepository.findByTenantId(tenantId);
    return journals
      .filter((journal) => journal.tenantId === tenantId && (journal.status === 'POSTED' || journal.status === 'REVERSED'))
      .sort((left, right) => {
        const byPosted = right.postedAt.getTime() - left.postedAt.getTime();
        if (byPosted !== 0) {
          return byPosted;
        }
        return left.id.localeCompare(right.id);
      });
  }

  async getPostedJournal(tenantId: string, journalId: string): Promise<PostedJournal | null> {
    const journal = await this.dependencies.journalRepository.getPostedJournal(journalId);
    if (journal === null || journal.tenantId !== tenantId) {
      return null;
    }
    if (journal.status !== 'POSTED' && journal.status !== 'REVERSED') {
      return null;
    }
    return journal;
  }

  async getAccountBalances(query: LedgerQuery): Promise<AccountBalance[]> {
    const { accounts, entries, currency } = await this.load(query);
    return deriveAccountBalances(accounts, entries, currency);
  }

  async getAccountBalance(tenantId: string, accountId: string, currency?: string): Promise<AccountBalance | null> {
    const account = await this.accountForTenant(accountId, tenantId);
    if (account === null) {
      return null;
    }
    const balances = await this.getAccountBalances({ tenantId, functionalCurrency: currency ?? account.currency });
    if (currency !== undefined) {
      return balances.find((balance) => balance.accountId === accountId && balance.currency === currency) ?? null;
    }
    return balances.find((balance) => balance.accountId === accountId) ?? null;
  }

  async getAccountLedger(tenantId: string, accountId: string, currency?: string): Promise<AccountLedger | null> {
    const account = await this.accountForTenant(accountId, tenantId);
    if (account === null) {
      return null;
    }
    const { entries, currency: functionalCurrency } = await this.load({ tenantId, functionalCurrency: currency ?? account.currency });
    const ledgerCurrency = currency ?? this.currencyForAccount(account, entries, functionalCurrency);
    return deriveAccountLedger(account, entries, ledgerCurrency);
  }

  async getTrialBalance(query: LedgerQuery): Promise<TrialBalance> {
    const { accounts, entries, currency, asOf } = await this.load(query);
    return deriveTrialBalance(accounts, entries, query.tenantId, asOf, currency);
  }

  async getLedgerTotals(query: LedgerQuery): Promise<LedgerTotals & { from: Date | null; to: Date | null; asOf: Date }> {
    const { accounts, entries, currency, asOf } = await this.load(query);
    const balances = deriveAccountBalances(accounts, entries, currency);
    return {
      ...deriveLedgerTotals(accounts, balances, entries),
      from: earliestActivityDate(entries),
      to: latestActivityDate(entries),
      asOf
    };
  }

  async getJournalBalanceImpact(tenantId: string, journalId: string): Promise<AccountBalanceImpact[]> {
    const journal = await this.getPostedJournal(tenantId, journalId);
    if (journal === null) {
      return [];
    }
    const { accounts, entries } = await this.load({ tenantId, functionalCurrency: journal.currency });
    return deriveJournalBalanceImpact(accounts, entries, journalId);
  }

  async getLedgerEntries(query: LedgerQuery): Promise<LedgerEntry[]> {
    const { entries } = await this.load(query);
    return entries;
  }

  private async load(query: LedgerQuery): Promise<{
    accounts: Account[];
    entries: LedgerEntry[];
    currency: string;
    asOf: Date;
  }> {
    const accounts = (await this.dependencies.accountRepository.findByTenantId(query.tenantId))
      .filter((account) => account.tenantId === query.tenantId)
      .sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id));
    const journals = await this.getPostedJournals(query.tenantId);
    const allEntries = ledgerEntriesFromPostedJournals(journals).filter((entry) => entry.tenantId === query.tenantId);
    const asOf = query.asOf ?? latestActivityDate(allEntries) ?? new Date();
    const entries = entriesOnOrBefore(allEntries, query.asOf);
    const currency = query.functionalCurrency ?? majorityCurrency(entries) ?? majorityCurrency(allEntries) ?? 'INR';
    return { accounts, entries, currency, asOf };
  }

  private async accountForTenant(accountId: string, tenantId: string): Promise<Account | null> {
    const account = await this.dependencies.accountRepository.getAccount(accountId);
    if (account === null || account.tenantId !== tenantId) {
      return null;
    }
    return account;
  }

  private currencyForAccount(account: Account, entries: readonly LedgerEntry[], fallback: string): string {
    const used = entries.find((entry) => entry.accountId === account.id);
    return used?.currency ?? account.currency ?? fallback;
  }
}

function majorityCurrency(entries: readonly LedgerEntry[]): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.currency, (counts.get(entry.currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}
