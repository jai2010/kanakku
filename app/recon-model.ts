import { ReconService } from '../src/application/recon/ReconService';
import {
  ReconFilter,
  ReconciliationItem,
  ReconciliationRun,
  ReconParty,
  ReconStatus,
  ReconSummary,
  summarizeRecon
} from '../src/domain/recon';
import { EngineEventType, EngineSnapshot, EngineTransactionView, rupee } from './engine-types';

export type { ReconFilter, ReconciliationItem, ReconciliationRun, ReconParty, ReconStatus, ReconSummary };

export const RECON_FILTERS: Array<{ id: ReconFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'matched', label: 'Matched' },
  { id: 'differences', label: 'Differences' },
  { id: 'missing', label: 'Missing' },
  { id: 'resolved', label: 'Resolved' }
];

export function loadDemoRecon(): ReconciliationRun {
  return ReconService.createDemo();
}

export function reconSummary(run: ReconciliationRun): ReconSummary {
  return summarizeRecon(run.items);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatReconDate(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map((part) => Number(part));
  return `${MONTHS[month - 1].toUpperCase()} ${day}`;
}

export function formatReconDay(isoDate: string): string {
  const [, month, day] = isoDate.split('-').map((part) => Number(part));
  return `${day} ${MONTHS_SHORT[month - 1]}`;
}

export function statusMark(status: ReconStatus): string {
  if (status === 'MATCHED' || status === 'RESOLVED') {
    return '✓';
  }
  if (status === 'DIFFERENCE') {
    return '⚠';
  }
  return '✕';
}

export function statusLabel(status: ReconStatus): string {
  if (status === 'MATCHED') {
    return 'MATCHED';
  }
  if (status === 'DIFFERENCE') {
    return 'DIFFERENCE';
  }
  if (status === 'MISSING_IN_KANAKKU') {
    return 'MISSING IN KANAKKU';
  }
  if (status === 'MISSING_EXTERNALLY') {
    return 'MISSING EXTERNALLY';
  }
  return 'RESOLVED';
}

export function statusTone(status: ReconStatus): 'ok' | 'warn' | 'bad' {
  if (status === 'MATCHED' || status === 'RESOLVED') {
    return 'ok';
  }
  if (status === 'DIFFERENCE') {
    return 'warn';
  }
  return 'bad';
}

export function itemTitle(item: ReconciliationItem): string {
  return item.external?.counterparty ?? item.kanakku?.counterparty ?? 'Transaction';
}

export function partyLabel(party: ReconParty | null): string {
  if (party === null) {
    return '—';
  }
  return party.description;
}

export function reconCommentary(item: ReconciliationItem): string {
  if (item.status === 'MATCHED') {
    return "These two agree. I'm not touching them.";
  }
  if (item.status === 'DIFFERENCE') {
    const amount = Math.abs(item.difference ?? 0);
    const side = (item.difference ?? 0) > 0 ? 'more than what I recorded' : 'less than what I recorded';
    return `That's ${rupee(amount)} ${side}. Someone explain that.`;
  }
  if (item.status === 'MISSING_IN_KANAKKU') {
    return "I see the transaction. I don't see the accounting.";
  }
  if (item.status === 'MISSING_EXTERNALLY') {
    return 'I recorded it. Apparently nobody told the other side.';
  }
  return "Fine. Now we're even.";
}

export function toEngineEventType(type: ReconParty['type']): EngineEventType {
  return type;
}

export function liveTransactionFor(
  snapshot: EngineSnapshot,
  item: ReconciliationItem
): EngineTransactionView | undefined {
  const party = item.kanakku ?? item.external;
  if (party === null) {
    return undefined;
  }
  const exact = snapshot.transactions.find((row) =>
    row.counterparty === party.counterparty
    && row.amount === party.amount
    && row.type === party.type
  );
  if (exact !== undefined) {
    return exact;
  }
  return snapshot.transactions.find((row) =>
    row.counterparty === party.counterparty
    && row.type === party.type
  );
}

export function liveJournalIdFor(snapshot: EngineSnapshot, item: ReconciliationItem): string | null {
  const transaction = liveTransactionFor(snapshot, item);
  return transaction?.journalId ?? null;
}

export function filterCount(summary: ReconSummary, filter: ReconFilter): number {
  if (filter === 'all') {
    return summary.itemCount;
  }
  if (filter === 'matched') {
    return summary.matched;
  }
  if (filter === 'differences') {
    return summary.differences;
  }
  if (filter === 'missing') {
    return summary.missing;
  }
  return summary.resolved;
}
