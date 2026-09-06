import { id } from '../fixtures/ids';
import { BusinessEvent, createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { resolveEventField } from '../../src/domain/events/resolveEventField';

function makeEvent(attributes: BusinessEvent['attributes'] = {}): BusinessEvent {
  return createBusinessEvent({
    id: id('evt-resolve'),
    tenantId: id('tenant-1'),
    eventType: 'PURCHASE',
    occurredAt: new Date('2026-09-03'),
    amount: 8200,
    currency: 'INR',
    counterparty: 'Supplier ABC',
    attributes,
    source: 'API'
  });
}

describe('resolveEventField — closed source resolution', () => {
  it('resolves eventType from the EVENT allowlist', () => {
    const result = resolveEventField(makeEvent(), 'eventType');
    expect(result).toEqual({ kind: 'FOUND', value: 'PURCHASE' });
  });

  it('resolves amount from the EVENT allowlist', () => {
    const result = resolveEventField(makeEvent(), 'amount');
    expect(result).toEqual({ kind: 'FOUND', value: 8200 });
  });

  it('resolves counterparty from the EVENT allowlist', () => {
    const result = resolveEventField(makeEvent(), 'counterparty');
    expect(result).toEqual({ kind: 'FOUND', value: 'Supplier ABC' });
  });

  it('resolves attributes.hasTax = true as FOUND(true)', () => {
    const result = resolveEventField(makeEvent({ hasTax: true }), 'attributes.hasTax');
    expect(result).toEqual({ kind: 'FOUND', value: true });
  });

  it('resolves attributes.hasTax = false as FOUND(false)', () => {
    const result = resolveEventField(makeEvent({ hasTax: false }), 'attributes.hasTax');
    expect(result).toEqual({ kind: 'FOUND', value: false });
  });

  it('resolves attributes.hasTax = null as FOUND(null)', () => {
    const result = resolveEventField(makeEvent({ hasTax: null }), 'attributes.hasTax');
    expect(result).toEqual({ kind: 'FOUND', value: null });
  });

  it('resolves an absent attribute as MISSING', () => {
    const result = resolveEventField(makeEvent({ invoiceType: 'SPLIT' }), 'attributes.hasTax');
    expect(result).toEqual({ kind: 'MISSING' });
  });

  it('rejects nested attribute paths such as attributes.foo.bar as MISSING', () => {
    const result = resolveEventField(
      makeEvent({ foo: { bar: true } }),
      'attributes.foo.bar'
    );
    expect(result).toEqual({ kind: 'MISSING' });
  });

  it('resolves an unknown field as MISSING', () => {
    const result = resolveEventField(makeEvent(), 'notAField');
    expect(result).toEqual({ kind: 'MISSING' });
  });

  it('rejects bracket notation, prototype-related names, and arbitrary traversal as MISSING', () => {
    const event = makeEvent({
      hasTax: true,
      constructor: 'own',
      prototype: 'own',
      __proto__: 'own'
    });

    expect(resolveEventField(event, 'attributes[hasTax]')).toEqual({ kind: 'MISSING' });
    expect(resolveEventField(event, "['hasTax']")).toEqual({ kind: 'MISSING' });
    expect(resolveEventField(event, 'attributes.constructor')).toEqual({ kind: 'MISSING' });
    expect(resolveEventField(event, 'attributes.prototype')).toEqual({ kind: 'MISSING' });
    expect(resolveEventField(event, 'attributes.__proto__')).toEqual({ kind: 'MISSING' });
    expect(resolveEventField(event, 'constructor')).toEqual({ kind: 'MISSING' });
  });
});
