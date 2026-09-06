import { id } from '../fixtures/ids';
import { BusinessEvent, createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { resolveAttributeAmount } from '../../src/domain/accounting/resolveAttributeAmount';

function makeEvent(attributes: BusinessEvent['attributes']): BusinessEvent {
  return createBusinessEvent({
    id: id('evt-attribute-amount'),
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

describe('resolveAttributeAmount — ATTRIBUTE_AMOUNT fail-closed resolution', () => {
  it('resolves a finite numeric attribute', () => {
    const result = resolveAttributeAmount(makeEvent({ taxAmount: 1000 }), 'taxAmount');
    expect(result).toEqual({ kind: 'OK', amount: 1000 });
  });

  it('fails closed when the attribute is missing', () => {
    const result = resolveAttributeAmount(makeEvent({}), 'taxAmount');
    expect(result).toEqual({ kind: 'INVALID' });
  });

  it('fails closed when the attribute is non-numeric', () => {
    const result = resolveAttributeAmount(makeEvent({ taxAmount: '1000' }), 'taxAmount');
    expect(result).toEqual({ kind: 'INVALID' });
  });

  it('fails closed when the attribute is non-finite', () => {
    expect(resolveAttributeAmount(makeEvent({ taxAmount: Number.NaN }), 'taxAmount')).toEqual({
      kind: 'INVALID'
    });
    expect(resolveAttributeAmount(makeEvent({ taxAmount: Number.POSITIVE_INFINITY }), 'taxAmount')).toEqual({
      kind: 'INVALID'
    });
  });

  it('fails closed for nested or invalid attribute identifiers', () => {
    expect(resolveAttributeAmount(makeEvent({ tax: { amount: 1000 } }), 'tax.amount')).toEqual({
      kind: 'INVALID'
    });
    expect(resolveAttributeAmount(makeEvent({ taxAmount: 1000 }), undefined)).toEqual({
      kind: 'INVALID'
    });
    expect(resolveAttributeAmount(makeEvent({ constructor: 1 }), 'constructor')).toEqual({
      kind: 'INVALID'
    });
  });

  it('does not coerce missing or invalid values to zero', () => {
    const missing = resolveAttributeAmount(makeEvent({}), 'taxAmount');
    const invalid = resolveAttributeAmount(makeEvent({ taxAmount: null }), 'taxAmount');
    expect(missing).not.toEqual({ kind: 'OK', amount: 0 });
    expect(invalid).not.toEqual({ kind: 'OK', amount: 0 });
  });
});
