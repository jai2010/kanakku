import { BusinessEvent } from '../events/BusinessEvent';
import { Journal } from './Journal';
import { PostedJournal } from './PostedJournal'; // We'll create this next
import { ReversalResult } from './ReversalResult'; // We'll create this next
import { AccountingEvaluation } from './AccountingEvaluation';

export interface AccountingEngine {
  /**
   * Evaluate a business event against applicable policies
   * @param event The business event to evaluate
   * @returns Evaluation result indicating if a rule matched and what treatment to apply
   */
  evaluate(event: BusinessEvent): Promise<AccountingEvaluation>;

  /**
   * Generate a journal entry from a business event
   * @param event The business event to generate a journal for
   * @returns A journal entry ready for posting
   */
  generateJournal(event: BusinessEvent): Promise<Journal>;

  /**
   * Post a journal entry to the ledger
   * @param journal The journal to post
   * @returns The posted journal with posting metadata
   */
  post(journal: Journal): Promise<PostedJournal>;

  /**
   * Reverse a posted journal entry
   * @param journalId The ID of the journal to reverse
   * @param reason The reason for the reversal
   * @returns Result of the reversal operation
   */
  reverse(journalId: string, reason: string, tenantId: string): Promise<ReversalResult>;
}