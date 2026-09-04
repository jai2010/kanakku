import { z } from 'zod';
import { JournalLineSchema } from './JournalLine'; // We'll create this next

export const JournalStatus = z.enum([
  'DRAFT',
  'POSTED',
  'REVERSED'
]);

export type JournalStatus = z.infer<typeof JournalStatus>;

export const JournalSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),

  businessEventId: z.string().uuid(),
  accountingTransactionId: z.string().uuid(),

  policyVersionId: z.string().uuid().optional(), // Optional because some postings might be manual/system
  ruleId: z.string().uuid().optional(), // Optional for the same reason

  transactionDate: z.date(),
  currency: z.string().length(3),

  description: z.string(),

  lines: z.array(JournalLineSchema).min(2), // At least two lines for double-entry

  status: JournalStatus,

  createdAt: z.date(),
  postedAt: z.date().optional()
});

export type Journal = z.infer<typeof JournalSchema>;

export const createJournal = (input: Omit<Journal, 'id' | 'createdAt'> & Partial<Pick<Journal, 'id' | 'createdAt'>>): Journal => {
  return {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    businessEventId: input.businessEventId,
    accountingTransactionId: input.accountingTransactionId,
    policyVersionId: input.policyVersionId,
    ruleId: input.ruleId,
    transactionDate: input.transactionDate,
    currency: input.currency,
    description: input.description,
    lines: input.lines,
    status: input.status ?? 'DRAFT',
    createdAt: input.createdAt ?? new Date(),
    postedAt: input.postedAt
  };
};