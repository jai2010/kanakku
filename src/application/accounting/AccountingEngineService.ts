import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { Journal } from '../../domain/accounting/Journal';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import { ReversalResult, createReversalResult } from '../../domain/accounting/ReversalResult';
import { AccountingEvaluation } from '../../domain/accounting/AccountingEvaluation';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { PolicyIR } from '../../domain/policies/PolicyIR';
import { Rule } from '../../domain/policies/PolicyIR';
import { AccountingTreatment } from '../../domain/accounting/AccountingTreatment';
import { createAccountingTreatment } from '../../domain/accounting/AccountingTreatment';
import { PolicyEngineService } from '../policies/PolicyEngineService';
import { Account } from '../../domain/accounting/Account';
import { resolveAttributeAmount, resolveFiniteNumber, resolveRateAmount } from '../../domain/accounting/resolveAttributeAmount';
import { JournalSchema } from '../../domain/accounting/Journal';
import { PostedJournalSchema } from '../../domain/accounting/PostedJournal';
import { parseDomain } from '../../domain/parse';

const SYSTEM_POSTED_BY = '00000000-0000-4000-8000-000000000099';

export interface AccountingEngineDependencies {
  accountRepository: {
    getAccount(id: string): Promise<Account | null>;
  };
  journalRepository: {
    getPostedJournal(id: string): Promise<PostedJournal | null>;
    savePostedJournal(postedJournal: PostedJournal): Promise<void>;
  };
}

export interface AccountingEngineServiceOptions {
  dependencies: AccountingEngineDependencies;
}

/**
 * Accounting Engine - Responsible for generating, validating, posting, and reversing journal entries.
 * This is the deterministic core of the SUTRA accounting engine.
 */
export class AccountingEngineService {
  private policyEngine: PolicyEngineService;
  private dependencies: AccountingEngineDependencies;

  constructor(options: AccountingEngineServiceOptions) {
    this.policyEngine = new PolicyEngineService();
    this.dependencies = options.dependencies;
  }

  /**
   * Evaluate a business event against applicable policies
   * @param event The business event to evaluate
   * @returns Evaluation result indicating if a rule matched and what treatment to apply
   */
  async evaluate(event: BusinessEvent): Promise<AccountingEvaluation> {
    // In a real implementation, we would resolve the appropriate policy version
    // based on the event date and tenant. For now, we'll need to pass in the policy version.
    // This method signature needs to be updated to accept policy version.
    // For now, returning a placeholder that indicates this needs policy version.
    throw new Error(' evaluate method requires policy version. Use evaluateWithPolicyVersion instead.');
  }

  /**
   * Evaluate a business event against a specific policy version
   * @param event The business event to evaluate
   * @param policyVersion The policy version to evaluate against
   * @returns Evaluation result with selected treatment if matched
   */
  async evaluateWithPolicyVersion(event: BusinessEvent, policyVersion: PolicyVersion): Promise<AccountingEvaluation> {
    const policyResult = this.policyEngine.evaluate(event, policyVersion);

    if (policyResult.reason === 'POLICY_NOT_ACTIVE' || policyResult.reason === 'POLICY_NOT_FOUND') {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: policyResult.matchedRuleIds,
        reason: policyResult.reason
      };
    }

    if (policyResult.reason === 'POLICY_INVALID_CONFLICTING_RULES') {
      return {
        matched: true,
        policyVersionId: policyVersion.id,
        matchedRuleIds: policyResult.matchedRuleIds,
        reason: 'POLICY_INVALID_CONFLICTING_RULES'
      };
    }

    if (!policyResult.matched) {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: policyResult.matchedRuleIds,
        reason: 'NO_MATCHING_RULE',
        ...(policyResult.selectedRuleId !== null
          ? { selectedRuleId: policyResult.selectedRuleId }
          : {})
      };
    }

    return {
      matched: true,
      policyVersionId: policyVersion.id,
      matchedRuleIds: policyResult.matchedRuleIds,
      reason: 'MATCHED_RULE',
      ...(policyResult.selectedRuleId !== null
        ? { selectedRuleId: policyResult.selectedRuleId }
        : {})
    };
  }

  /**
   * Generate a journal entry from a business event using a policy version
   * @param event The business event to generate a journal for
   * @param policyVersion The policy version to use for rule evaluation
   * @returns A journal entry ready for posting
   */
  async generateJournal(event: BusinessEvent, policyVersion: PolicyVersion): Promise<Journal> {
    // Evaluate the event against the policy version
    const evaluation = await this.evaluateWithPolicyVersion(event, policyVersion);

    if (evaluation.reason === 'POLICY_INVALID_CONFLICTING_RULES') {
      throw new Error('Conflicting rules matched at the same priority');
    }

    if (!evaluation.matched || !evaluation.selectedRuleId) {
      throw new Error('No matching rule found for event');
    }

    return this.buildJournalFromSelectedRule(event, policyVersion, evaluation.selectedRuleId);
  }

  /**
   * Build and validate a journal preview for a matched rule.
   * Read-only: never posts or persists.
   */
  async previewFromMatchedRule(
    event: BusinessEvent,
    policyVersion: PolicyVersion,
    selectedRuleId: string
  ): Promise<{
    journal?: Journal;
    validation: {
      valid: boolean;
      reason?: string;
      totalDebits?: number;
      totalCredits?: number;
    };
    error?: string;
  }> {
    try {
      const journal = await this.buildJournalFromSelectedRule(event, policyVersion, selectedRuleId);
      const validation = await this.validateJournal(journal);
      return { journal, validation };
    } catch (error) {
      return {
        validation: { valid: false },
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async buildJournalFromSelectedRule(
    event: BusinessEvent,
    policyVersion: PolicyVersion,
    selectedRuleId: string
  ): Promise<Journal> {
    const rule = policyVersion.definition.rules.find(r => r.id === selectedRuleId);
    if (!rule) {
      throw new Error(`Rule not found: ${selectedRuleId}`);
    }

    const treatment = rule.then.treatment;

    if (!event.currency) {
      throw new Error('CURRENCY_INVALID: event currency is required');
    }

    const journalId = crypto.randomUUID();
    const journalLines = await this.generateJournalLines(treatment, event, journalId);

    return {
      id: journalId,
      tenantId: event.tenantId,
      businessEventId: event.id,
      accountingTransactionId: crypto.randomUUID(),
      policyVersionId: policyVersion.id,
      ruleId: selectedRuleId,
      transactionDate: event.occurredAt,
      currency: event.currency,
      description: `Journal for ${event.eventType} event`,
      lines: journalLines,
      status: 'DRAFT',
      createdAt: new Date()
    };
  }

  /**
   * Generate journal lines from an accounting treatment
   * @param treatment The accounting treatment to convert to journal lines
   * @param event The business event (needed for EVENT_AMOUNT)
   * @returns Array of journal lines
   */
  private async generateJournalLines(treatment: AccountingTreatment, event: BusinessEvent, journalId: string): Promise<Array<{
    id: string;
    journalId: string; // Will be set later
    accountId: string;
    debit: number;
    credit: number;
    currency: string;
    description: string;
  }>> {
    const lines: Array<{
      id: string;
      journalId: string;
      accountId: string;
      debit: number;
      credit: number;
      currency: string;
      description: string;
    }> = [];

    for (let i = 0; i < treatment.lines.length; i++) {
      const line = treatment.lines[i];

      // Get the account to validate it exists and is active
      const account = await this.dependencies.accountRepository.getAccount(line.accountId);
      if (!account) {
        throw new Error(`Account not found: ${line.accountId}`);
      }

      if (account.status !== 'ACTIVE') {
        throw new Error(`Account is not active: ${line.accountId}`);
      }

      if (account.tenantId !== event.tenantId) {
        throw new Error(`Account tenant mismatch: ${line.accountId}`);
      }

      if (!event.currency) {
        throw new Error('CURRENCY_INVALID: event currency is required');
      }

      let amount: number;
      let currency = event.currency;

      if (line.amount.type === 'EVENT_AMOUNT') {
        const resolvedAmount = resolveFiniteNumber(event.amount);
        if (resolvedAmount.kind === 'INVALID') {
          throw new Error('EVENT_AMOUNT failed closed: event amount is missing or not a finite number');
        }
        amount = resolvedAmount.amount;
        currency = event.currency;
      } else if (line.amount.type === 'FIXED_AMOUNT') {
        const resolvedAmount = resolveFiniteNumber(line.amount.value);
        if (resolvedAmount.kind === 'INVALID') {
          throw new Error('FIXED_AMOUNT failed closed: value is missing or not a finite number');
        }
        if (!line.amount.currency) {
          throw new Error('CURRENCY_INVALID: FIXED_AMOUNT currency is required');
        }
        amount = resolvedAmount.amount;
        currency = line.amount.currency;
      } else if (line.amount.type === 'ATTRIBUTE_AMOUNT') {
        const resolvedAmount = resolveAttributeAmount(event, line.amount.attribute);
        if (resolvedAmount.kind === 'INVALID') {
          throw new Error(
            `ATTRIBUTE_AMOUNT failed closed for attribute: ${line.amount.attribute ?? '(missing)'}`
          );
        }
        amount = resolvedAmount.amount;
        currency = event.currency;
      } else if (line.amount.type === 'RATE_AMOUNT') {
        const resolvedAmount = resolveRateAmount(event.amount, line.amount.rate);
        if (resolvedAmount.kind === 'INVALID') {
          throw new Error('RATE_AMOUNT failed closed: event amount or rate is missing or not a finite number');
        }
        amount = resolvedAmount.amount;
        currency = event.currency;
      } else {
        throw new Error('AMOUNT_INVALID: unsupported amount expression type');
      }

      const journalLine = {
        id: crypto.randomUUID(),
        journalId,
        accountId: line.accountId,
        debit: line.side === 'DEBIT' ? amount : 0,
        credit: line.side === 'CREDIT' ? amount : 0,
        currency: currency,
        description: line.description || ''
      };

      lines.push(journalLine);
    }

    return lines;
  }

  /**
   * Validate a journal entry before posting
   * @param journal The journal to validate
   * @returns Validation result
   */
  async validateJournal(journal: Journal): Promise<{
    valid: boolean;
    reason?: string;
    accountId?: string;
    totalDebits?: number;
    totalCredits?: number;
  }> {
    // Check minimum lines
    if (journal.lines.length < 2) {
      return { valid: false, reason: 'INSUFFICIENT_LINES' };
    }

    for (const line of journal.lines) {
      if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit)) {
        return { valid: false, reason: 'NON_FINITE_AMOUNT', accountId: line.accountId };
      }

      if (line.debit < 0 || line.credit < 0) {
        return { valid: false, reason: 'NON_POSITIVE_AMOUNT', accountId: line.accountId };
      }

      const hasDebit = line.debit > 0;
      const hasCredit = line.credit > 0;

      if (hasDebit === hasCredit) {
        return { valid: false, reason: 'INVALID_LINE_SIDE' };
      }

      const account = await this.dependencies.accountRepository.getAccount(line.accountId);
      if (!account) {
        return { valid: false, reason: 'ACCOUNT_NOT_FOUND', accountId: line.accountId };
      }

      if (account.status !== 'ACTIVE') {
        return { valid: false, reason: 'ACCOUNT_INACTIVE', accountId: line.accountId };
      }

      if (account.tenantId !== journal.tenantId) {
        return { valid: false, reason: 'ACCOUNT_TENANT_MISMATCH', accountId: line.accountId };
      }
    }

    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);

    if (!Number.isFinite(totalDebits) || !Number.isFinite(totalCredits) || totalDebits !== totalCredits) {
      return { valid: false, reason: 'JOURNAL_NOT_BALANCED', totalDebits, totalCredits };
    }

    return { valid: true };
  }

  /**
   * Post a journal entry to the ledger
   * @param journal The journal to post
   * @returns The posted journal with posting metadata
   */
  async post(journal: Journal): Promise<PostedJournal> {
    // Validate the journal before posting
    const validation = await this.validateJournal(journal);
    if (!validation.valid) {
      throw new Error(`Cannot post invalid journal: ${validation.reason}`);
    }

    parseDomain(JournalSchema, journal, 'Journal');

    const postedJournal = parseDomain(PostedJournalSchema, {
      ...journal,
      lines: snapshotJournalLines(journal.lines),
      status: 'POSTED',
      postedAt: new Date(),
      postedBy: SYSTEM_POSTED_BY,
      transactionId: crypto.randomUUID()
    }, 'PostedJournal');

    await this.dependencies.journalRepository.savePostedJournal(postedJournal);
    return postedJournal;
  }

  /**
   * Reverse a posted journal entry
   * @param journalId The ID of the journal to reverse
   * @param reason The reason for the reversal
   * @returns Result of the reversal operation
   */
  async reverse(journalId: string, reason: string, tenantId: string): Promise<ReversalResult> {
    return this.reversePersistedJournal(journalId, reason, tenantId);
  }

  /**
   * Reverse a posted journal entry with access to the posted journal
   * @param postedJournal The posted journal to reverse
   * @param reason The reason for the reversal
   * @returns Result of the reversal operation
   */
  async reversePostedJournal(postedJournal: PostedJournal, reason: string, tenantId: string): Promise<ReversalResult> {
    return this.reversePersistedJournal(postedJournal.id, reason, tenantId);
  }

  private async reversePersistedJournal(journalId: string, reason: string, tenantId: string): Promise<ReversalResult> {
    const postedJournal = await this.dependencies.journalRepository.getPostedJournal(journalId);

    if (!postedJournal || postedJournal.tenantId !== tenantId) {
      return createReversalResult({
        status: 'JOURNAL_NOT_FOUND',
        originalJournalId: journalId,
        message: 'Journal not found'
      });
    }

    if (postedJournal.status === 'REVERSED') {
      return createReversalResult({
        status: 'ALREADY_REVERSED',
        originalJournalId: postedJournal.id,
        message: 'Journal has already been reversed'
      });
    }

    if (postedJournal.status !== 'POSTED') {
      return createReversalResult({
        status: 'JOURNAL_NOT_POSTED',
        originalJournalId: postedJournal.id,
        message: 'Only posted journals can be reversed'
      });
    }

    const reversalJournalId = crypto.randomUUID();
    const reversalJournal: Journal = {
      id: reversalJournalId,
      tenantId: postedJournal.tenantId,
      businessEventId: postedJournal.businessEventId,
      accountingTransactionId: crypto.randomUUID(),
      policyVersionId: postedJournal.policyVersionId,
      ruleId: postedJournal.ruleId,
      transactionDate: postedJournal.transactionDate,
      currency: postedJournal.currency,
      description: `Reversal of journal ${postedJournal.id}`,
      lines: postedJournal.lines.map((line) => ({
        id: crypto.randomUUID(),
        journalId: reversalJournalId,
        accountId: line.accountId,
        debit: line.credit,
        credit: line.debit,
        currency: line.currency,
        description: `Reversal: ${line.description || ''}`
      })),
      status: 'DRAFT',
      createdAt: new Date()
    };

    let postedReversal: PostedJournal;
    try {
      postedReversal = await this.post(reversalJournal);
    } catch (error) {
      return createReversalResult({
        status: 'REVERSAL_FAILED',
        originalJournalId: postedJournal.id,
        message: `Failed to create valid reversal journal: ${error instanceof Error ? error.message : String(error)}`
      });
    }

    const reversedOriginal: PostedJournal = {
      ...postedJournal,
      lines: snapshotJournalLines(postedJournal.lines),
      status: 'REVERSED'
    };
    await this.dependencies.journalRepository.savePostedJournal(reversedOriginal);

    return createReversalResult({
      status: 'SUCCESS',
      originalJournalId: postedJournal.id,
      reversalJournalId: postedReversal.id,
      message: 'Reversal journal generated successfully'
    });
  }
}

function snapshotJournalLines(lines: Journal['lines']): Journal['lines'] {
  return lines.map((line) => ({ ...line }));
}