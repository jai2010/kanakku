import { z } from 'zod';
import { isEventAttributeIdentifier } from '../events/resolveEventField';
import { parseDomain } from '../parse';

export const TreatmentSide = z.enum([
  'DEBIT',
  'CREDIT'
]);

export type TreatmentSide = z.infer<typeof TreatmentSide>;

// RATE_AMOUNT is a fraction of EVENT_AMOUNT (0.05 = 5%).
export const AmountExpressionType = z.enum([
  'EVENT_AMOUNT',
  'FIXED_AMOUNT',
  'ATTRIBUTE_AMOUNT',
  'RATE_AMOUNT'
]);

export type AmountExpressionType = z.infer<typeof AmountExpressionType>;

// In a more complete implementation, we would have a discriminated union for amount expressions
// For now, we'll use a simple object with a type and value (for FIXED_AMOUNT)
// For EVENT_AMOUNT, the value is not needed (it's the event amount)
export const AmountExpressionSchema = z.object({
  type: AmountExpressionType,
  // For FIXED_AMOUNT, we need a value and currency
  value: z.number().finite().positive().optional(),
  currency: z.string().length(3).optional(),
  // For ATTRIBUTE_AMOUNT, a single attribute identifier
  attribute: z.string().optional(),
  // For RATE_AMOUNT, a positive fraction of EVENT_AMOUNT
  rate: z.number().finite().positive().max(1).optional()
}).refine((val) => {
  if (val.type === 'FIXED_AMOUNT') {
    return val.value !== undefined && val.currency !== undefined;
  }
  if (val.type === 'ATTRIBUTE_AMOUNT') {
    return val.attribute !== undefined && isEventAttributeIdentifier(val.attribute);
  }
  if (val.type === 'RATE_AMOUNT') {
    return val.rate !== undefined && val.rate > 0 && val.rate <= 1;
  }
  return true;
});

export type AmountExpression = z.infer<typeof AmountExpressionSchema>;

export const TreatmentLineSchema = z.object({
  accountId: z.string().uuid(),
  side: TreatmentSide,
  amount: AmountExpressionSchema,
  description: z.string().optional()
});

export type TreatmentLine = z.infer<typeof TreatmentLineSchema>;

export const AccountingTreatmentSchema = z.object({
  lines: z.array(TreatmentLineSchema).min(2) // At least two lines for double-entry
});

export type AccountingTreatment = z.infer<typeof AccountingTreatmentSchema>;

export const createAccountingTreatment = (input: Omit<AccountingTreatment, 'lines'> & { lines: TreatmentLine[] }): AccountingTreatment => {
  return parseDomain(AccountingTreatmentSchema, {
    lines: input.lines
  }, 'AccountingTreatment');
};