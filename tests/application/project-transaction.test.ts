import { id } from '../fixtures/ids';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createJournal } from '../../src/domain/accounting/Journal';
import { createJournalLine } from '../../src/domain/accounting/JournalLine';
import { createPostedJournal } from '../../src/domain/accounting/PostedJournal';
import { projectTransaction } from '../../src/application/accounting/projectTransaction';
import { rateUsage } from '../../src/domain/events/rateUsage';

describe('transaction ledger projection', () => {
  it('projects a captured usage event as not accounted until a journal exists', () => {
    const amount = rateUsage(10, 48);
    const event = createBusinessEvent({
      id: id('evt-usage'),
      tenantId: id('tenant-1'),
      eventType: 'USAGE',
      occurredAt: new Date('2026-09-06T10:00:00.000Z'),
      amount,
      currency: 'INR',
      counterparty: 'AWS',
      source: 'API',
      attributes: {
        category: 'EC2 Compute',
        meter: 'compute_hours',
        quantity: 10,
        unitPrice: 48,
        unit: 'hours'
      }
    });
    const projection = projectTransaction({ event, matched: false, error: 'No matching rule found for event' });
    expect(projection.transactionType).toBe('USAGE');
    expect(projection.amount).toBe(480);
    expect(projection.usage).toEqual({
      meter: 'compute_hours',
      quantity: 10,
      unitPrice: 48,
      unit: 'hours'
    });
    expect(projection.pipeline).toMatchObject({ captured: true, rated: true, accounted: false, unmatched: true, failed: false });
    expect(projection.accountingStatus).toBe('NOT_ACCOUNTED');
    expect(projection.journalId).toBeUndefined();
  });

  it('joins a posted journal as accounted without duplicating the event', () => {
    const event = createBusinessEvent({
      id: id('evt-starbucks'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-05T10:00:00.000Z'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      source: 'API',
      attributes: { category: 'Coffee chain' }
    });
    const journalId = id('jn-1');
    const journal = createPostedJournal(createJournal({
      id: journalId,
      tenantId: id('tenant-1'),
      businessEventId: event.id,
      accountingTransactionId: id('txn-1'),
      transactionDate: event.occurredAt,
      currency: 'INR',
      description: 'Starbucks',
      status: 'POSTED',
      lines: [
        createJournalLine({ journalId, accountId: id('acc-meals'), debit: 7800, credit: 0, currency: 'INR' }),
        createJournalLine({ journalId, accountId: id('acc-card'), debit: 0, credit: 7800, currency: 'INR' })
      ]
    }), id('user-1'));
    const projection = projectTransaction({
      event,
      journal,
      matched: true,
      selectedRuleId: id('rule-meals')
    });
    expect(projection.accountingStatus).toBe('ACCOUNTED');
    expect(projection.pipeline.accounted).toBe(true);
    expect(projection.journalId).toBe(journalId);
    expect(projection.eventId).toBe(event.id);
  });
});
