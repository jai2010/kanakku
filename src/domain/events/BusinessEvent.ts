import { z } from 'zod';

export const EventType = z.enum([
  'PURCHASE',
  'REFUND',
  'PAYMENT'
  // Future types: INVOICE, INVOICE_PAYMENT, SALE, RETURN, FEE, TAX, SALARY, DIVIDEND, etc.
]);

export type EventType = z.infer<typeof EventType>;

export const EventSource = z.enum([
  'API',
  'DOCUMENT',
  'HUMAN_INPUT',
  'EMAIL',
  'CSV',
  'BANK_FEED'
]);

export type EventSource = z.infer<typeof EventSource>;

export const BusinessEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),

  eventType: EventType,

  occurredAt: z.date(),

  amount: z.number().positive().optional(), // Using number for simplicity in MVP, could use Decimal library
  currency: z.string().length(3).optional(),

  counterparty: z.string().optional(),

  attributes: z.record(z.unknown()), // Extensible attributes

  source: EventSource.optional(),

  createdAt: z.date()
});

export type BusinessEvent = z.infer<typeof BusinessEventSchema>;

export const createBusinessEvent = (input: Omit<BusinessEvent, 'id' | 'createdAt' | 'attributes'> & Partial<Pick<BusinessEvent, 'id' | 'createdAt' | 'attributes'>>): BusinessEvent => {
  return {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    amount: input.amount,
    currency: input.currency,
    counterparty: input.counterparty,
    attributes: input.attributes ?? {},
    source: input.source,
    createdAt: input.createdAt ?? new Date()
  };
};