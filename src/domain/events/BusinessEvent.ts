import { z } from 'zod';
import { parseDomain } from '../parse';

export const EVENT_TYPES = [
  'PURCHASE',
  'REFUND',
  'PAYMENT',
  'USAGE',
  'WALLET_LOAD',
  'WALLET_SPEND',
  'MARKETPLACE_SALE',
  'SELLER_PAYOUT'
] as const;

export const EventType = z.enum(EVENT_TYPES);

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

  amount: z.number().finite().optional(),
  currency: z.string().length(3).optional(),

  counterparty: z.string().optional(),

  attributes: z.record(z.unknown()), // Extensible attributes

  source: EventSource.optional(),

  createdAt: z.date()
});

export type BusinessEvent = z.infer<typeof BusinessEventSchema>;

export const createBusinessEvent = (input: Omit<BusinessEvent, 'id' | 'createdAt' | 'attributes'> & Partial<Pick<BusinessEvent, 'id' | 'createdAt' | 'attributes'>>): BusinessEvent => {
  return parseDomain(BusinessEventSchema, {
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
  }, 'BusinessEvent');
};