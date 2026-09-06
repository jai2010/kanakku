export type UsageCharge = {
  meter: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
};

export function rateUsage(quantity: number, unitPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    throw new Error('USAGE_RATE_INVALID: quantity and unitPrice must be finite numbers');
  }
  if (quantity < 0 || unitPrice < 0) {
    throw new Error('USAGE_RATE_INVALID: quantity and unitPrice must be non-negative');
  }
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function usageFromAttributes(attributes: Record<string, unknown>): UsageCharge | undefined {
  const quantity = attributes.quantity;
  const unitPrice = attributes.unitPrice;
  const meter = attributes.meter;
  if (typeof quantity !== 'number' || typeof unitPrice !== 'number' || typeof meter !== 'string' || meter.length === 0) {
    return undefined;
  }
  const usage: UsageCharge = { meter, quantity, unitPrice };
  if (typeof attributes.unit === 'string' && attributes.unit.length > 0) {
    usage.unit = attributes.unit;
  }
  return usage;
}
