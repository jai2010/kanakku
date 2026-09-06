import { id } from '../fixtures/ids';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';

describe('BusinessEvent Domain Model', () => {
  it('should create a valid purchase event', () => {
    const event = createBusinessEvent({
      id: id('evt-1'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: { invoiceNumber: 'INV-001' },
      source: 'API'
    });

    expect(event.id).toBe(id('evt-1'));
    expect(event.tenantId).toBe(id('tenant-1'));
    expect(event.eventType).toBe('PURCHASE');
    expect(event.occurredAt.toString()).toBe(new Date('2026-09-03').toString());
    expect(event.amount).toBe(7800);
    expect(event.currency).toBe('INR');
    expect(event.counterparty).toBe('Starbucks');
    expect(event.attributes).toEqual({ invoiceNumber: 'INV-001' });
    expect(event.source).toBe('API');
  });

  it('accepts a USAGE event as the operational transaction record', () => {
    const event = createBusinessEvent({
      id: id('evt-usage'),
      tenantId: id('tenant-1'),
      eventType: 'USAGE',
      occurredAt: new Date('2026-09-06'),
      amount: 480,
      currency: 'INR',
      counterparty: 'AWS',
      attributes: { meter: 'compute_hours', quantity: 10, unitPrice: 48 }
    });
    expect(event.eventType).toBe('USAGE');
    expect(event.amount).toBe(480);
  });

  it('should create an event with optional fields undefined', () => {
    const event = createBusinessEvent({
      id: id('evt-2'),
      tenantId: id('tenant-1'),
      eventType: 'PAYMENT',
      occurredAt: new Date('2026-09-03')
      // amount, currency, counterparty, attributes, source are optional
    });

    expect(event.amount).toBeUndefined();
    expect(event.currency).toBeUndefined();
    expect(event.counterparty).toBeUndefined();
    expect(event.attributes).toEqual({});
    expect(event.source).toBeUndefined();
  });
});