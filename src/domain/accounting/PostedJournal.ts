import { z } from 'zod';
import { Journal, JournalSchema } from './Journal';

export const PostedJournalSchema = z.object({
  // All properties from Journal
  ...JournalSchema.shape,

  // Additional posting metadata
  postedAt: z.date(),
  postedBy: z.string().uuid(), // Reference to user/system who posted
  transactionId: z.string().uuid() // Unique transaction ID for the posting
});

export type PostedJournal = z.infer<typeof PostedJournalSchema>;

export const createPostedJournal = (journal: Journal, postedBy: string): PostedJournal => {
  return {
    ...journal,
    postedAt: new Date(),
    postedBy: postedBy,
    transactionId: crypto.randomUUID() // In a real system, this might come from the database
  };
};