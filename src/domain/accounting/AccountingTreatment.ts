import { z } from 'zod';

export const TreatmentSide = z.enum([
  'DEBIT',
  'CREDIT'
]);

export type TreatmentSide = z.infer<typeof TreatmentSide>;

// For MVP, we support EVENT_AMOUNT and FIXED_AMOUNT
export const AmountExpressionType = z.enum([
  'EVENT_AMOUNT',
  'FIXED_AMOUNT'
]);

export type AmountExpressionType = z.infer<typeof AmountExpressionType>;

// In a more complete implementation, we would have a discriminated union for amount expressions
// For now, we'll use a simple object with a type and value (for FIXED_AMOUNT)
// For EVENT_AMOUNT, the value is not needed (it's the event amount)
export const AmountExpressionSchema = z.object({
  type: AmountExpressionType,
  // For FIXED_AMOUNT, we need a value and currency
  value: z.number().positive().optional(),
  currency: z.string().length(3).optional()
}).refine((val) => {
  if (val.type === 'FIXED_AMOUNT') {
    return val.value !== undefined && val.currency !== undefined;
  }
  // For EVENT_AMOUNT, we don't require value or currency (they come from the event)
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
  return {
    lines: input.lines
  };
};