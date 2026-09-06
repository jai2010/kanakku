import { Account, AccountType } from '../accounting/Account';
import { LedgerEntry } from './LedgerEntry';
import { BalanceSide, displayBalance, normalBalanceSide, signedDelta } from './normalBalance';

export type AccountBalance = {
  accountId: string;
  tenantId: string;
  currency: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  balanceSide: BalanceSide;
};

export type AccountLedgerLine = LedgerEntry & {
  runningBalance: number;
  runningBalanceSide: BalanceSide;
};

export type AccountLedger = {
  account: Account;
  currency: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
  balanceSide: BalanceSide;
  entries: AccountLedgerLine[];
};

export type TrialBalanceLine = {
  accountId: string;
  currency: string;
  debit: number;
  credit: number;
};

export type TrialBalance = {
  tenantId: string;
  asOf: Date;
  currency: string;
  lines: TrialBalanceLine[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
};

export type TypeTotal = {
  type: AccountType;
  balance: number;
  balanceSide: BalanceSide;
};

export type LedgerTotals = {
  accountCount: number;
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
  typeTotals: TypeTotal[];
};

export type AccountBalanceImpact = {
  accountId: string;
  currency: string;
  debit: number;
  credit: number;
  previousBalance: number;
  previousBalanceSide: BalanceSide;
  nextBalance: number;
  nextBalanceSide: BalanceSide;
};

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

export function entriesOnOrBefore(entries: readonly LedgerEntry[], asOf?: Date): LedgerEntry[] {
  if (asOf === undefined) {
    return [...entries];
  }
  const cutoff = asOf.getTime();
  return entries.filter((entry) => entry.transactionDate.getTime() <= cutoff);
}

export function accumulateAccountBalance(
  account: Account,
  entries: readonly LedgerEntry[],
  currency: string
): AccountBalance {
  let totalDebits = 0;
  let totalCredits = 0;
  let signed = 0;
  for (const entry of entries) {
    if (entry.accountId !== account.id || entry.currency !== currency) {
      continue;
    }
    totalDebits += entry.debit;
    totalCredits += entry.credit;
    signed += signedDelta(entry.debit, entry.credit, account.type);
  }
  const displayed = displayBalance(signed, account.type);
  return {
    accountId: account.id,
    tenantId: account.tenantId,
    currency,
    totalDebits,
    totalCredits,
    balance: displayed.balance,
    balanceSide: displayed.balanceSide
  };
}

export function runningAccountLedger(
  account: Account,
  entries: readonly LedgerEntry[],
  currency: string
): AccountLedger {
  const lines: AccountLedgerLine[] = [];
  let signed = 0;
  let totalDebits = 0;
  let totalCredits = 0;
  for (const entry of entries) {
    if (entry.accountId !== account.id || entry.currency !== currency) {
      continue;
    }
    signed += signedDelta(entry.debit, entry.credit, account.type);
    totalDebits += entry.debit;
    totalCredits += entry.credit;
    const displayed = displayBalance(signed, account.type);
    lines.push({
      ...entry,
      runningBalance: displayed.balance,
      runningBalanceSide: displayed.balanceSide
    });
  }
  const displayed = displayBalance(signed, account.type);
  return {
    account,
    currency,
    totalDebits,
    totalCredits,
    balance: displayed.balance,
    balanceSide: displayed.balanceSide,
    entries: lines
  };
}

export function deriveAccountBalances(
  accounts: readonly Account[],
  entries: readonly LedgerEntry[],
  functionalCurrency: string
): AccountBalance[] {
  const currenciesByAccount = new Map<string, Set<string>>();
  for (const entry of entries) {
    const existing = currenciesByAccount.get(entry.accountId) ?? new Set<string>();
    existing.add(entry.currency);
    currenciesByAccount.set(entry.accountId, existing);
  }

  const balances: AccountBalance[] = [];
  for (const account of accounts) {
    const currencies = currenciesByAccount.get(account.id);
    if (currencies === undefined || currencies.size === 0) {
      balances.push(accumulateAccountBalance(account, entries, account.currency ?? functionalCurrency));
      continue;
    }
    for (const currency of [...currencies].sort()) {
      balances.push(accumulateAccountBalance(account, entries, currency));
    }
  }
  return balances;
}

export function deriveAccountLedger(
  account: Account,
  entries: readonly LedgerEntry[],
  currency: string
): AccountLedger {
  return runningAccountLedger(account, entries, currency);
}

export function deriveTrialBalance(
  accounts: readonly Account[],
  entries: readonly LedgerEntry[],
  tenantId: string,
  asOf: Date,
  functionalCurrency: string
): TrialBalance {
  const inScope = entriesOnOrBefore(entries, asOf);
  const currencies = new Set(inScope.map((entry) => entry.currency));
  if (currencies.size === 0) {
    currencies.add(functionalCurrency);
  }

  const lines: TrialBalanceLine[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const account of accounts) {
    const accountCurrencies = new Set(
      inScope.filter((entry) => entry.accountId === account.id).map((entry) => entry.currency)
    );
    if (accountCurrencies.size === 0) {
      continue;
    }
    for (const currency of [...accountCurrencies].sort()) {
      const balance = accumulateAccountBalance(account, inScope, currency);
      if (balance.balance === 0) {
        continue;
      }
      const debit = balance.balanceSide === 'DEBIT' ? balance.balance : 0;
      const credit = balance.balanceSide === 'CREDIT' ? balance.balance : 0;
      lines.push({
        accountId: account.id,
        currency,
        debit,
        credit
      });
      totalDebits += debit;
      totalCredits += credit;
    }
  }

  return {
    tenantId,
    asOf,
    currency: currencies.size === 1 ? [...currencies][0] ?? functionalCurrency : functionalCurrency,
    lines,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits
  };
}

export function deriveLedgerTotals(
  accounts: readonly Account[],
  balances: readonly AccountBalance[],
  entries: readonly LedgerEntry[]
): LedgerTotals {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const entry of entries) {
    totalDebits += entry.debit;
    totalCredits += entry.credit;
  }

  const signedByType = new Map<AccountType, number>();
  for (const type of ACCOUNT_TYPES) {
    signedByType.set(type, 0);
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  for (const balance of balances) {
    const account = accountById.get(balance.accountId);
    if (account === undefined) {
      continue;
    }
    const signed = balance.balanceSide === normalBalanceSide(account.type) ? balance.balance : -balance.balance;
    signedByType.set(account.type, (signedByType.get(account.type) ?? 0) + signed);
  }

  return {
    accountCount: accounts.length,
    totalDebits,
    totalCredits,
    balanced: totalDebits === totalCredits,
    typeTotals: ACCOUNT_TYPES.map((type) => {
      const displayed = displayBalance(signedByType.get(type) ?? 0, type);
      return { type, balance: displayed.balance, balanceSide: displayed.balanceSide };
    })
  };
}

export function deriveJournalBalanceImpact(
  accounts: readonly Account[],
  entries: readonly LedgerEntry[],
  journalId: string
): AccountBalanceImpact[] {
  const journalEntries = entries.filter((entry) => entry.journalId === journalId);
  if (journalEntries.length === 0) {
    return [];
  }
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const keys = new Map<string, { accountId: string; currency: string; debit: number; credit: number }>();
  for (const entry of journalEntries) {
    const key = `${entry.accountId}:${entry.currency}`;
    const existing = keys.get(key) ?? { accountId: entry.accountId, currency: entry.currency, debit: 0, credit: 0 };
    existing.debit += entry.debit;
    existing.credit += entry.credit;
    keys.set(key, existing);
  }

  const withoutJournal = entries.filter((entry) => entry.journalId !== journalId);
  const impact: AccountBalanceImpact[] = [];
  for (const item of keys.values()) {
    const account = accountById.get(item.accountId);
    if (account === undefined) {
      continue;
    }
    const previous = accumulateAccountBalance(account, withoutJournal, item.currency);
    const next = accumulateAccountBalance(account, entries, item.currency);
    impact.push({
      accountId: account.id,
      currency: item.currency,
      debit: item.debit,
      credit: item.credit,
      previousBalance: previous.balance,
      previousBalanceSide: previous.balanceSide,
      nextBalance: next.balance,
      nextBalanceSide: next.balanceSide
    });
  }
  return impact;
}

export function latestActivityDate(entries: readonly LedgerEntry[]): Date | null {
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce((latest, entry) =>
    entry.transactionDate.getTime() > latest.getTime() ? entry.transactionDate : latest
  , entries[0]!.transactionDate);
}

export function earliestActivityDate(entries: readonly LedgerEntry[]): Date | null {
  if (entries.length === 0) {
    return null;
  }
  return entries.reduce((earliest, entry) =>
    entry.transactionDate.getTime() < earliest.getTime() ? entry.transactionDate : earliest
  , entries[0]!.transactionDate);
}
