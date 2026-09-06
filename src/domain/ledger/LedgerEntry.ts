import { PostedJournal } from '../accounting/PostedJournal';

export type LedgerEntry = {
  id: string;
  journalId: string;
  accountId: string;
  tenantId: string;
  transactionDate: Date;
  postedAt: Date;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  businessEventId: string;
  policyVersionId?: string;
  ruleId?: string;
  journalStatus: 'POSTED' | 'REVERSED';
};

export function compareLedgerEntries(left: LedgerEntry, right: LedgerEntry): number {
  const byDate = left.transactionDate.getTime() - right.transactionDate.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  const byPosted = left.postedAt.getTime() - right.postedAt.getTime();
  if (byPosted !== 0) {
    return byPosted;
  }
  const byJournal = left.journalId.localeCompare(right.journalId);
  if (byJournal !== 0) {
    return byJournal;
  }
  return left.id.localeCompare(right.id);
}

export function ledgerEntriesFromPostedJournals(journals: readonly PostedJournal[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const journal of journals) {
    if (journal.status !== 'POSTED' && journal.status !== 'REVERSED') {
      continue;
    }
    for (const line of journal.lines) {
      const description = line.description !== undefined && line.description.length > 0
        ? line.description
        : journal.description;
      const entry: LedgerEntry = {
        id: line.id,
        journalId: journal.id,
        accountId: line.accountId,
        tenantId: journal.tenantId,
        transactionDate: journal.transactionDate,
        postedAt: journal.postedAt,
        description,
        debit: line.debit,
        credit: line.credit,
        currency: line.currency,
        businessEventId: journal.businessEventId,
        journalStatus: journal.status
      };
      if (journal.policyVersionId !== undefined) {
        entry.policyVersionId = journal.policyVersionId;
      }
      if (journal.ruleId !== undefined) {
        entry.ruleId = journal.ruleId;
      }
      entries.push(entry);
    }
  }
  return entries.sort(compareLedgerEntries);
}
