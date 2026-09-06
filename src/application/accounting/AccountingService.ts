import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { Journal } from '../../domain/accounting/Journal';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import { ReversalResult } from '../../domain/accounting/ReversalResult';
import { AccountingEvaluation } from '../../domain/accounting/AccountingEvaluation';
import { PolicyEngineService } from '../policies/PolicyEngineService';
import { AccountingEngineService, AccountingEngineDependencies } from './AccountingEngineService';
import { BusinessEventSchema } from '../../domain/events/BusinessEvent';
import { parseDomain } from '../../domain/parse';

export interface AccountingServiceDependencies {
  policyVersionRepository: {
    getActivePolicyVersion(tenantId: string, eventDate: Date): Promise<PolicyVersion | null>;
  };
  accountRepository: {
    getAccount(id: string): Promise<import('../../domain/accounting/Account').Account | null>;
  };
  journalRepository: {
    getPostedJournal(id: string): Promise<PostedJournal | null>;
    savePostedJournal(postedJournal: PostedJournal): Promise<void>;
    findByBusinessEventId(businessEventId: string, tenantId: string): Promise<PostedJournal[]>;
  };
}

/**
 * Accounting Service - Orchestrates the complete accounting process:
 * Business Event → Policy Resolution → Rule Evaluation →
 * Journal Generation → Validation → Posting
 */
export class AccountingService {
  private policyEngine: PolicyEngineService;
  private accountingEngine: AccountingEngineService;
  private dependencies: AccountingServiceDependencies;

  constructor(dependencies: AccountingServiceDependencies) {
    this.policyEngine = new PolicyEngineService();
    this.accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository: dependencies.accountRepository,
        journalRepository: dependencies.journalRepository
      }
    });
    this.dependencies = dependencies;
  }

  /**
   * Process a business event through the complete accounting pipeline
   * @param event The business event to process
   * @returns Result of the accounting process
   */
  async processEvent(event: BusinessEvent): Promise<{
    evaluation: AccountingEvaluation;
    journal?: Journal;
    postedJournal?: PostedJournal;
    reversalResult?: ReversalResult;
    error?: string;
  }> {
    let evaluation: AccountingEvaluation | undefined;

    try {
      event = parseDomain(BusinessEventSchema, event, 'BusinessEvent');

      const existingOriginal = this.originalJournalForEvent(
        await this.dependencies.journalRepository.findByBusinessEventId(event.id, event.tenantId)
      );
      if (existingOriginal) {
        return {
          evaluation: {
            matched: true,
            policyVersionId: existingOriginal.policyVersionId,
            matchedRuleIds: existingOriginal.ruleId ? [existingOriginal.ruleId] : [],
            reason: 'MATCHED_RULE',
            ...(existingOriginal.ruleId !== undefined
              ? { selectedRuleId: existingOriginal.ruleId }
              : {})
          },
          journal: existingOriginal,
          postedJournal: existingOriginal
        };
      }

      const policyVersion = await this.dependencies.policyVersionRepository.getActivePolicyVersion(
        event.tenantId,
        event.occurredAt
      );

      if (!policyVersion) {
        return {
          evaluation: {
            matched: false,
            matchedRuleIds: [],
            reason: 'NO_MATCHING_RULE'
          },
          error: 'No active policy version found for the event date'
        };
      }

      evaluation = await this.accountingEngine.evaluateWithPolicyVersion(event, policyVersion);

      if (evaluation.reason === 'POLICY_INVALID_CONFLICTING_RULES') {
        return {
          evaluation,
          error: 'Conflicting rules matched at the same priority'
        };
      }

      if (!evaluation.matched) {
        if (evaluation.reason === 'POLICY_NOT_ACTIVE') {
          return {
            evaluation,
            error: 'Policy version is not ACTIVE'
          };
        }
        return {
          evaluation,
          error: 'No matching rule found for event'
        };
      }

      const journal = await this.accountingEngine.generateJournal(event, policyVersion);

      const validation = await this.accountingEngine.validateJournal(journal);
      if (!validation.valid) {
        return {
          evaluation,
          journal,
          error: `Journal validation failed: ${validation.reason}`
        };
      }

      const postedJournal = await this.accountingEngine.post(journal);

      return {
        evaluation,
        journal,
        postedJournal
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        evaluation: this.evaluationForCaughtError(evaluation, message),
        error: message
      };
    }
  }

  /**
   * Reverse a posted journal entry
   * @param postedJournalId The ID of the posted journal to reverse
   * @param reason The reason for the reversal
   * @returns Reversal result
   */
  async reverseJournal(postedJournalId: string, reason: string, tenantId: string): Promise<{
    success: boolean;
    message: string;
    reversalJournalId: string | null;
    originalJournalId: string;
  }> {
    const postedJournal = await this.getPostedJournal(postedJournalId, tenantId);

    if (!postedJournal) {
      return {
        success: false,
        message: 'Journal not found',
        reversalJournalId: null,
        originalJournalId: postedJournalId
      };
    }

    const result = await this.accountingEngine.reversePostedJournal(postedJournal, reason, tenantId);

    return {
      success: result.status === 'SUCCESS',
      message: result.message,
      reversalJournalId: result.reversalJournalId ?? null,
      originalJournalId: result.originalJournalId
    };
  }

  /**
   * Reverse a posted journal entry with access to the posted journal
   * @param postedJournal The posted journal to reverse
   * @param reason The reason for the reversal
   * @returns Reversal result
   */
  async reversePostedJournal(postedJournal: PostedJournal, reason: string, tenantId: string): Promise<ReversalResult> {
    return this.accountingEngine.reversePostedJournal(postedJournal, reason, tenantId);
  }

  async getPostedJournal(journalId: string, tenantId: string): Promise<PostedJournal | null> {
    const postedJournal = await this.dependencies.journalRepository.getPostedJournal(journalId);
    if (!postedJournal || postedJournal.tenantId !== tenantId) {
      return null;
    }
    return postedJournal;
  }

  private originalJournalForEvent(journals: PostedJournal[]): PostedJournal | undefined {
    return journals.find((journal) => !journal.description.startsWith('Reversal of journal '));
  }

  private evaluationForCaughtError(
    evaluation: AccountingEvaluation | undefined,
    message: string
  ): AccountingEvaluation {
    const failureReason = reasonFromAccountingError(message);

    if (evaluation) {
      if (!failureReason) {
        return evaluation;
      }
      return {
        ...evaluation,
        reason: failureReason
      };
    }

    return {
      matched: false,
      matchedRuleIds: [],
      reason: failureReason ?? 'NO_MATCHING_RULE'
    };
  }
}

function reasonFromAccountingError(message: string): AccountingEvaluation['reason'] | undefined {
  if (
    message.includes('Account not found') ||
    message.includes('Account is not active') ||
    message.includes('Account tenant mismatch')
  ) {
    return 'ACCOUNT_INVALID';
  }
  if (
    message.includes('EVENT_AMOUNT failed closed') ||
    message.includes('FIXED_AMOUNT failed closed') ||
    message.includes('ATTRIBUTE_AMOUNT failed closed') ||
    message.includes('AMOUNT_INVALID') ||
    message.includes('CURRENCY_INVALID')
  ) {
    return 'AMOUNT_INVALID';
  }
  return undefined;
}