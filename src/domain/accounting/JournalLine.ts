import { z } from 'zod';

export const JournalLineSchema = z.object({
  id: z.string().uuid(),
  journalId: z.string().uuid(),
  accountId: z.string().uuid(),

  // Using separate debit and credit fields ensures only one is > 0
  debit: z.number().finite().nonnegative(),
  credit: z.number().finite().nonnegative(),

  currency: z.string().length(3),

  description: z.string().optional()
}).refine((val) => {
  // Exactly one of debit or credit must be greater than 0
  const hasDebit = val.debit > 0;
  const hasCredit = val.credit > 0;
  return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
});

export type JournalLine = z.infer<typeof JournalLineSchema>;

export const createJournalLine = (input: Omit<JournalLine, 'id'> & Partial<Pick<JournalLine, 'id'>>): JournalLine => {
  return {
    id: input.id ?? crypto.randomUUID(),
    journalId: input.journalId,
    accountId: input.accountId,
    debit: input.debit ?? 0,
    credit: input.credit ?? 0,
    currency: input.currency,
    description: input.description
  };
};