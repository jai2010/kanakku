import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import { usageFromAttributes, UsageCharge } from '../../domain/events/rateUsage';

export type TransactionAccountingStatus = 'NOT_ACCOUNTED' | 'ACCOUNTED' | 'FAILED';

export type TransactionPipeline = {
  captured: true;
  rated: boolean;
  accounted: boolean;
  unmatched: boolean;
  failed: boolean;
};

/**
 * Read model over a captured BusinessEvent plus any posted journal.
 * BusinessEvent remains the operational source of truth; this does not persist.
 */
export type TransactionProjection = {
  eventId: string;
  tenantId: string;
  occurredAt: Date;
  source: string;
  transactionType: BusinessEvent['eventType'];
  counterparty?: string;
  description: string;
  amount?: number;
  currency?: string;
  usage?: UsageCharge;
  accountingStatus: TransactionAccountingStatus;
  pipeline: TransactionPipeline;
  journalId?: string;
  selectedRuleId?: string;
};

export function projectTransaction(input: {
  event: BusinessEvent;
  journal?: PostedJournal | null;
  matched?: boolean;
  selectedRuleId?: string;
  error?: string | null;
}): TransactionProjection {
  const event = input.event;
  const journal = input.journal ?? null;
  const usage = usageFromAttributes(event.attributes);
  const rated = event.amount !== undefined && Number.isFinite(event.amount);
  const accounted = journal !== null && (journal.status === 'POSTED' || journal.status === 'REVERSED');
  const unmatched = input.matched === false && !accounted;
  const failed = !accounted && !unmatched && input.error !== null && input.error !== undefined && input.error.length > 0;
  const description = transactionDescription(event, usage);

  const projection: TransactionProjection = {
    eventId: event.id,
    tenantId: event.tenantId,
    occurredAt: event.occurredAt,
    source: event.source ?? event.counterparty ?? 'API',
    transactionType: event.eventType,
    description,
    pipeline: {
      captured: true,
      rated,
      accounted,
      unmatched,
      failed
    },
    accountingStatus: accounted ? 'ACCOUNTED' : failed ? 'FAILED' : 'NOT_ACCOUNTED'
  };
  if (event.counterparty !== undefined) {
    projection.counterparty = event.counterparty;
  }
  if (event.amount !== undefined) {
    projection.amount = event.amount;
  }
  if (event.currency !== undefined) {
    projection.currency = event.currency;
  }
  if (usage !== undefined) {
    projection.usage = usage;
  }
  if (journal !== null) {
    projection.journalId = journal.id;
  }
  if (input.selectedRuleId !== undefined) {
    projection.selectedRuleId = input.selectedRuleId;
  }
  return projection;
}

function transactionDescription(event: BusinessEvent, usage: UsageCharge | undefined): string {
  const explicit = event.attributes.description;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  if (typeof event.attributes.category === 'string' && event.attributes.category.trim().length > 0) {
    const category = event.attributes.category.trim();
    if (event.counterparty !== undefined && event.counterparty.length > 0 && event.counterparty !== category) {
      return `${event.counterparty} ${category}`;
    }
    return category;
  }
  if (usage !== undefined) {
    return event.counterparty !== undefined ? `${event.counterparty} ${usage.meter}` : usage.meter;
  }
  return event.counterparty ?? event.eventType;
}
