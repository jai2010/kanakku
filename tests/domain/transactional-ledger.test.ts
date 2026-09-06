import { id } from '../fixtures/ids';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import {
  createParticipantAccount,
  createTransactionalEntry,
  deriveBalance,
  materializeTransactionalEntries,
  runningLedger
} from '../../src/domain/transactional';

describe('transactional ledger', () => {
  const tenantId = id('tenant-tx');
  const account = createParticipantAccount({
    id: id('seller-acme'),
    tenantId,
    participantId: 'S001',
    kind: 'SELLER',
    name: 'Acme Electronics',
    currency: 'INR',
    createdAt: new Date('2026-09-01')
  });

  it('derives seller balance from immutable entries, not a stored field', () => {
    const sale = createTransactionalEntry({
      accountId: account.id,
      businessEventId: id('evt-sale'),
      type: 'SALE',
      amount: 10000,
      direction: 'CREDIT',
      description: 'Gross sale',
      effectiveAt: new Date('2026-09-06T10:00:00.000Z'),
      createdAt: new Date('2026-09-06T10:00:00.000Z')
    });
    const fee = createTransactionalEntry({
      accountId: account.id,
      businessEventId: id('evt-sale'),
      type: 'FEE',
      amount: 500,
      direction: 'DEBIT',
      description: 'Marketplace fee',
      effectiveAt: new Date('2026-09-06T10:00:00.000Z'),
      createdAt: new Date('2026-09-06T10:00:01.000Z')
    });
    const tax = createTransactionalEntry({
      accountId: account.id,
      businessEventId: id('evt-sale'),
      type: 'TAX',
      amount: 900,
      direction: 'DEBIT',
      description: 'Tax',
      effectiveAt: new Date('2026-09-06T10:00:00.000Z'),
      createdAt: new Date('2026-09-06T10:00:02.000Z')
    });
    expect(deriveBalance([sale, fee, tax])).toBe(8600);
    expect(runningLedger([tax, sale, fee]).map((line) => line.runningBalance)).toEqual([10000, 9500, 8600]);
  });

  it('materializes sale, fee, and tax as separate effects of one business event', () => {
    const event = createBusinessEvent({
      id: id('evt-mkt'),
      tenantId,
      eventType: 'MARKETPLACE_SALE',
      occurredAt: new Date('2026-09-06T12:00:00.000Z'),
      amount: 10000,
      currency: 'INR',
      counterparty: 'Acme Electronics',
      attributes: { sellerId: 'S001', orderId: 'ORD-1001' }
    });
    const entries = materializeTransactionalEntries({
      event,
      account,
      treatment: {
        participantKind: 'SELLER',
        participantField: 'attributes.sellerId',
        effects: [
          { type: 'SALE', direction: 'CREDIT', amount: { type: 'EVENT_AMOUNT' }, description: 'Gross sale' },
          { type: 'FEE', direction: 'DEBIT', amount: { type: 'RATE', rate: 0.05 }, description: 'Marketplace fee' },
          { type: 'TAX', direction: 'DEBIT', amount: { type: 'RATE', rate: 0.09 }, description: 'Tax' }
        ]
      }
    });
    expect(entries.map((entry) => [entry.type, entry.amount])).toEqual([
      ['SALE', 10000],
      ['FEE', 500],
      ['TAX', 900]
    ]);
    expect(runningLedger(entries).map((line) => line.runningBalance)).toEqual([10000, 9500, 8600]);
    expect(new Set(entries.map((entry) => entry.businessEventId))).toEqual(new Set([event.id]));
  });
});
