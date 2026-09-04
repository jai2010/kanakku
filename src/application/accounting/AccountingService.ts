import { AccountingEngine } from '../../domain/accounting/AccountingEngine';
import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { Journal } from '../../domain/accounting/Journal';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import { AccountingEvaluation } from '../../domain/accounting/AccountingEvaluation';

export class AccountingService {
  constructor(private accountingEngine: AccountingEngine) {}

  /**
   * Process a business event through the full accounting pipeline
   * @param event The business event to process
   * @returns The posted journal if successful, or null if no matching rule was found
   */
  async processEvent(event: BusinessEvent): Promise<PostedJournal | null> {
    // Step 1: Evaluate the event against policies
    const evaluation = await this.accountingEngine.evaluate(event);

    if (!evaluation.matched) {
      // No matching rule found - event remains unposted
      return null;
    }

    // Step 2: Generate journal entry
    const journal = await this.accountingEngine.generateJournal(event);

    // Step 3: Post the journal to the ledger
    const postedJournal = await this.accountingEngine.post(journal);

    return postedJournal;
  }

  /**
   * Reverse a posted journal entry
   * @param journalId The ID of the journal to reverse
   * @param reason The reason for the reversal
   * @returns Result of the reversal operation
   */
  async reverseJournal(journalId: string, reason: string): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.accountingEngine.reverse(journalId, reason);
      return {
        success: result.status === 'SUCCESS',
        message: result.message
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}