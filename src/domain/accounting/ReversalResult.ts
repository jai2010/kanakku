import { z } from 'zod';
import { Journal } from './Journal';

export const ReversalStatus = z.enum([
  'SUCCESS',
  'JOURNAL_NOT_FOUND',
  'JOURNAL_NOT_POSTED',
  'ALREADY_REVERSED',
  'REVERSAL_FAILED'
]);

export type ReversalStatus = z.infer<typeof ReversalStatus>;

export const ReversalResultSchema = z.object({
  status: ReversalStatus,
  reversalJournalId: z.string().uuid().optional(), // The ID of the reversal journal created
  originalJournalId: z.string().uuid(),
  message: z.string()
});

export type ReversalResult = z.infer<typeof ReversalResultSchema>;

export const createReversalResult = (input: Omit<ReversalResult, 'status'> & Partial<Pick<ReversalResult, 'status'>>): ReversalResult => {
  return {
    status: input.status ?? 'SUCCESS',
    reversalJournalId: input.reversalJournalId,
    originalJournalId: input.originalJournalId,
    message: input.message ?? ''
  };
};