import {
  EngineParticipantView,
  EngineTransactionView,
  transactionKindLabel,
  typeLabel
} from './engine-types';

export type TxKindFilter = 'ALL' | 'Purchases' | 'Wallet' | 'Marketplace Sales' | 'Payouts';
export type ParticipantKindFilter = 'ALL' | 'BUYER' | 'SELLER';
export type TransactionsPane = 'activity' | 'participants';

export const TX_KIND_FILTERS: TxKindFilter[] = ['ALL', 'Purchases', 'Wallet', 'Marketplace Sales', 'Payouts'];

export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/[₹,]/g, '').replace(/\s+/g, ' ').trim();
}

export function participantBalanceLabel(kind: EngineParticipantView['kind']): string {
  return kind === 'SELLER' ? 'Eligible payout' : 'Wallet';
}

export function participantTypeLabel(kind: EngineParticipantView['kind']): string {
  return kind === 'SELLER' ? 'Seller' : 'Buyer';
}

export function matchesParticipantQuery(row: EngineParticipantView, query: string): boolean {
  const needle = normalizeSearch(query);
  if (needle.length === 0) {
    return true;
  }
  const hay = normalizeSearch([
    row.name,
    row.participantId,
    participantTypeLabel(row.kind),
    participantBalanceLabel(row.kind),
    String(row.balance),
    row.balance.toLocaleString('en-IN')
  ].join(' '));
  return hay.includes(needle);
}

export function matchesTransactionQuery(row: EngineTransactionView, query: string): boolean {
  const needle = normalizeSearch(query);
  if (needle.length === 0) {
    return true;
  }
  const hay = normalizeSearch([
    row.displayId,
    row.counterparty,
    row.description,
    row.participantName ?? '',
    row.participantId ?? '',
    row.orderId ?? '',
    typeLabel(row.type),
    String(row.amount),
    row.amount.toLocaleString('en-IN')
  ].join(' '));
  return hay.includes(needle);
}

export function filterActivityTransactions(
  rows: EngineTransactionView[],
  input: { kind: TxKindFilter; query: string; ruleFilter?: string | null }
): EngineTransactionView[] {
  return rows.filter((row) => {
    if (input.ruleFilter && row.selectedRule !== input.ruleFilter) {
      return false;
    }
    if (input.kind !== 'ALL' && transactionKindLabel(row.type) !== input.kind) {
      return false;
    }
    return matchesTransactionQuery(row, input.query);
  });
}

export function filterParticipants(
  rows: EngineParticipantView[],
  input: { kind: ParticipantKindFilter; query: string }
): EngineParticipantView[] {
  return rows.filter((row) => {
    if (input.kind !== 'ALL' && row.kind !== input.kind) {
      return false;
    }
    return matchesParticipantQuery(row, input.query);
  });
}

export function participantCounts(rows: EngineParticipantView[]): { buyers: number; sellers: number } {
  return {
    buyers: rows.filter((row) => row.kind === 'BUYER').length,
    sellers: rows.filter((row) => row.kind === 'SELLER').length
  };
}
