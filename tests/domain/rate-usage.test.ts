import { rateUsage, usageFromAttributes } from '../../src/domain/events/rateUsage';

describe('usage rating', () => {
  it('computes quantity × unitPrice deterministically', () => {
    expect(rateUsage(10, 48)).toBe(480);
    expect(rateUsage(10, 0.48)).toBe(4.8);
  });

  it('fails closed on invalid inputs', () => {
    expect(() => rateUsage(Number.NaN, 1)).toThrow('USAGE_RATE_INVALID');
    expect(() => rateUsage(-1, 10)).toThrow('USAGE_RATE_INVALID');
  });

  it('reads usage attributes from a business event payload', () => {
    expect(usageFromAttributes({
      meter: 'compute_hours',
      quantity: 10,
      unitPrice: 48,
      unit: 'hours'
    })).toEqual({
      meter: 'compute_hours',
      quantity: 10,
      unitPrice: 48,
      unit: 'hours'
    });
    expect(usageFromAttributes({ category: 'Coffee' })).toBeUndefined();
  });
});
