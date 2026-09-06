import { z } from 'zod';
import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { resolveEventField } from '../../domain/events/resolveEventField';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { Rule } from '../../domain/policies/PolicyIR';
import { AccountingTreatment } from '../../domain/accounting/AccountingTreatment';
import { ConditionOperator } from '../../domain/policies/PolicyIR';
import { Condition, ConditionSchema } from '../../domain/policies/PolicyIR';
import { WhenClause } from '../../domain/policies/PolicyIR';
import { PolicyIRSchema } from '../../domain/policies/PolicyIR';
import { parseDomain } from '../../domain/parse';
import { Account } from '../../domain/accounting/Account';
import { Journal } from '../../domain/accounting/Journal';
import {
  collectAccountPolicyIssues,
  collectStructuralPolicyIssues,
  createPolicyValidationResult,
  parsePolicyVersionForValidation,
  PolicyValidationResult
} from '../../domain/policies/PolicyValidation';
import {
  createSimulationResult,
  SimulatedEventResult,
  SimulationResult
} from '../../domain/policies/SimulationResult';

export interface PolicyEvaluationResult {
  matched: boolean;
  policyVersionId: string;
  matchedRuleIds: string[];
  selectedRuleId: string | null;
  reason: 'MATCHED_RULE' | 'NO_MATCHING_RULE' | 'POLICY_INVALID_CONFLICTING_RULES' | 'POLICY_NOT_ACTIVE' | 'POLICY_NOT_FOUND';
  selectedTreatment?: AccountingTreatment;
}

export type PolicyEvaluateOptions = {
  requireActive?: boolean;
};

export type JournalPreviewer = {
  previewFromMatchedRule(
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
  }>;
};

/**
 * Policy Engine - Responsible for evaluating business events against policy versions
 * and selecting the appropriate accounting treatment based on rule priority.
 */
export class PolicyEngineService {
  /**
   * Evaluate a business event against a policy version to determine
   * the appropriate accounting treatment.
   *
   * @param event The business event to evaluate
   * @param policyVersion The policy version to evaluate against
   * @returns Policy evaluation result with selected treatment if matched
   */
  evaluate(
    event: BusinessEvent,
    policyVersion: PolicyVersion,
    options?: PolicyEvaluateOptions
  ): PolicyEvaluationResult {
    parseDomain(PolicyIRSchema, policyVersion.definition, 'PolicyIR');

    if (policyVersion.tenantId !== event.tenantId) {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: [],
        selectedRuleId: null,
        reason: 'POLICY_NOT_FOUND'
      };
    }

    const requireActive = options?.requireActive !== false;
    if (requireActive && policyVersion.status !== 'ACTIVE') {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: [],
        selectedRuleId: null,
        reason: 'POLICY_NOT_ACTIVE'
      };
    }

    if (!this.isEffective(event.occurredAt, policyVersion)) {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: [],
        selectedRuleId: null,
        reason: 'NO_MATCHING_RULE'
      };
    }

    // Evaluate all rules
    const matchedRules: { rule: Rule; treatment: AccountingTreatment }[] = [];

    for (const rule of policyVersion.definition.rules) {
      if (this.evaluateCondition(rule.when, event)) {
        matchedRules.push({ rule, treatment: rule.then.treatment });
      }
    }

    // No rules matched
    if (matchedRules.length === 0) {
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: [],
        selectedRuleId: null,
        reason: 'NO_MATCHING_RULE'
      };
    }

    // Check for conflicting rules (same priority)
    const priorityGroups: Map<number, Array<{ rule: Rule; treatment: AccountingTreatment }>> = new Map();

    for (const matched of matchedRules) {
      const priority = matched.rule.priority;
      const group = priorityGroups.get(priority);
      if (group === undefined) {
        priorityGroups.set(priority, [matched]);
      } else {
        group.push(matched);
      }
    }

    // Check for conflicts at same priority
    for (const [priority, rules] of priorityGroups.entries()) {
      if (rules.length > 1) {
        // Found conflicting rules at same priority
        return {
          matched: true, // Technically matched but invalid due to conflict
          policyVersionId: policyVersion.id,
          matchedRuleIds: matchedRules.map(m => m.rule.id),
          selectedRuleId: null,
          reason: 'POLICY_INVALID_CONFLICTING_RULES'
        };
      }
    }

    // Find highest priority rule
    let highestPriority = -Infinity;
    let selectedMatch: { rule: Rule; treatment: AccountingTreatment } | null = null;

    for (const matched of matchedRules) {
      if (matched.rule.priority > highestPriority) {
        highestPriority = matched.rule.priority;
        selectedMatch = matched;
      }
    }

    if (!selectedMatch) {
      // This shouldn't happen if we have matched rules, but just in case
      return {
        matched: false,
        policyVersionId: policyVersion.id,
        matchedRuleIds: [],
        selectedRuleId: null,
        reason: 'NO_MATCHING_RULE'
      };
    }

    return {
      matched: true,
      policyVersionId: policyVersion.id,
      matchedRuleIds: matchedRules.map(m => m.rule.id),
      selectedRuleId: selectedMatch.rule.id,
      reason: 'MATCHED_RULE',
      selectedTreatment: selectedMatch.treatment
    };
  }

  async validate(
    input: unknown,
    options: {
      tenantId: string;
      getAccount: (id: string) => Promise<Account | null>;
    }
  ): Promise<PolicyValidationResult> {
    const parsed = parsePolicyVersionForValidation(input);
    if (parsed.version === undefined) {
      return createPolicyValidationResult({
        valid: false,
        issues: parsed.issues
      });
    }

    const version = parsed.version;
    const issues = collectStructuralPolicyIssues(version);

    if (version.tenantId !== options.tenantId) {
      issues.push({
        code: 'TENANT_MISMATCH',
        message: 'Policy version tenant does not match requested tenant'
      });
    }

    const accountIds = new Set<string>();
    for (const rule of version.definition.rules) {
      for (const line of rule.then.treatment.lines) {
        accountIds.add(line.accountId);
      }
    }

    const accounts = new Map<string, Account>();
    for (const accountId of accountIds) {
      const account = await options.getAccount(accountId);
      if (account !== null) {
        accounts.set(accountId, account);
      }
    }
    issues.push(...collectAccountPolicyIssues(version, accounts));

    return createPolicyValidationResult({
      valid: issues.length === 0,
      policyVersionId: version.id,
      issues
    });
  }

  async simulate(
    policyVersion: PolicyVersion,
    events: BusinessEvent[],
    previewer: JournalPreviewer
  ): Promise<SimulationResult> {
    const eventResults: SimulatedEventResult[] = [];

    for (const event of events) {
      const evaluation = this.evaluate(event, policyVersion, { requireActive: false });
      eventResults.push(await this.simulateOne(event, policyVersion, evaluation, previewer));
    }

    return createSimulationResult({
      policyVersionId: policyVersion.id,
      policyStatus: policyVersion.status,
      events: eventResults
    });
  }

  private async simulateOne(
    event: BusinessEvent,
    policyVersion: PolicyVersion,
    evaluation: PolicyEvaluationResult,
    previewer: JournalPreviewer
  ): Promise<SimulatedEventResult> {
    const base = {
      eventId: event.id,
      policyVersionId: policyVersion.id,
      matched: evaluation.matched,
      selectedRuleId: evaluation.selectedRuleId,
      matchedRuleIds: evaluation.matchedRuleIds
    };

    if (evaluation.reason === 'POLICY_INVALID_CONFLICTING_RULES') {
      return {
        ...base,
        reason: 'POLICY_INVALID_CONFLICTING_RULES',
        wouldPost: false,
        error: 'Conflicting rules matched at the same priority'
      };
    }

    if (evaluation.reason === 'POLICY_NOT_FOUND') {
      return {
        ...base,
        reason: 'POLICY_NOT_FOUND',
        wouldPost: false,
        error: 'Policy version tenant does not match event tenant'
      };
    }

    if (!evaluation.matched || evaluation.selectedRuleId === null) {
      return {
        ...base,
        reason: 'NO_MATCHING_RULE',
        wouldPost: false
      };
    }

    const preview = await previewer.previewFromMatchedRule(
      event,
      policyVersion,
      evaluation.selectedRuleId
    );

    if (preview.error !== undefined || preview.journal === undefined) {
      return {
        ...base,
        reason: 'JOURNAL_GENERATION_FAILED',
        ...(evaluation.selectedTreatment !== undefined
          ? { treatment: evaluation.selectedTreatment }
          : {}),
        wouldPost: false,
        error: preview.error ?? 'Journal preview could not be generated'
      };
    }

    const totalDebits = preview.journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = preview.journal.lines.reduce((sum, line) => sum + line.credit, 0);
    const journalPreview = {
      lines: preview.journal.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        currency: line.currency,
        description: line.description ?? ''
      })),
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits
    };

    if (!preview.validation.valid) {
      return {
        ...base,
        reason: 'JOURNAL_INVALID',
        ...(evaluation.selectedTreatment !== undefined
          ? { treatment: evaluation.selectedTreatment }
          : {}),
        journalPreview,
        wouldPost: false,
        validationReason: preview.validation.reason,
        error: `Journal validation failed: ${preview.validation.reason ?? 'invalid'}`
      };
    }

    return {
      ...base,
      reason: 'MATCHED_RULE',
      ...(evaluation.selectedTreatment !== undefined
        ? { treatment: evaluation.selectedTreatment }
        : {}),
      journalPreview,
      wouldPost: true
    };
  }

  /**
   * Check if a policy version is effective for a given date
   * @param date The date to check effectiveness against
   * @param policyVersion The policy version to check
   * @returns true if the policy version is effective at the given date
   */
  private isEffective(date: Date, policyVersion: PolicyVersion): boolean {
    const eventDate = date.getTime();
    const effectiveFrom = policyVersion.effectiveFrom.getTime();

    // Check effectiveFrom
    if (eventDate < effectiveFrom) {
      return false;
    }

    // Check effectiveTo if it exists
    if (policyVersion.effectiveTo) {
      const effectiveTo = policyVersion.effectiveTo.getTime();
      if (eventDate > effectiveTo) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a condition (can be simple or complex with logical operators)
   * @param condition The condition to evaluate
   * @param event The business event to evaluate against
   * @returns true if the condition matches
   */
  private evaluateCondition(condition: WhenClause, event: BusinessEvent): boolean {
    const simple = ConditionSchema.safeParse(condition);
    if (simple.success) {
      return this.evaluateSimpleCondition(simple.data, event);
    }

    const andGroup = z.object({ AND: z.array(z.unknown()) }).safeParse(condition);
    if (andGroup.success) {
      for (const subcondition of andGroup.data.AND) {
        if (!this.isWhenClause(subcondition) || !this.evaluateCondition(subcondition, event)) {
          return false;
        }
      }
      return true;
    }

    const orGroup = z.object({ OR: z.array(z.unknown()) }).safeParse(condition);
    if (orGroup.success) {
      for (const subcondition of orGroup.data.OR) {
        if (this.isWhenClause(subcondition) && this.evaluateCondition(subcondition, event)) {
          return true;
        }
      }
      return false;
    }

    const notGroup = z.object({ NOT: z.unknown() }).safeParse(condition);
    if (notGroup.success) {
      if (!this.isWhenClause(notGroup.data.NOT)) {
        return false;
      }
      return !this.evaluateCondition(notGroup.data.NOT, event);
    }

    return false;
  }

  private isWhenClause(value: unknown): value is WhenClause {
    return typeof value === 'object' && value !== null;
  }

  private compareOrdered(
    left: unknown,
    right: unknown,
    compare: (left: number | string, right: number | string) => boolean
  ): boolean {
    if (typeof left === 'number' && typeof right === 'number') {
      return compare(left, right);
    }
    if (typeof left === 'string' && typeof right === 'string') {
      return compare(left, right);
    }
    return false;
  }

  /**
   * Evaluate a simple condition (field, operator, value)
   * @param condition The simple condition to evaluate
   * @param event The business event to evaluate against
   * @returns true if the condition matches
   */
  private evaluateSimpleCondition(condition: Condition, event: BusinessEvent): boolean {
    const resolved = resolveEventField(event, condition.field);

    if (resolved.kind === 'MISSING') {
      return false;
    }

    const eventValue = resolved.value;

    switch (condition.operator) {
      case ConditionOperator.enum.equals:
        return eventValue === condition.value;
      case ConditionOperator.enum.not_equals:
        return eventValue !== condition.value;
      case ConditionOperator.enum.greater_than:
        return this.compareOrdered(eventValue, condition.value, (left, right) => left > right);
      case ConditionOperator.enum.greater_than_or_equal:
        return this.compareOrdered(eventValue, condition.value, (left, right) => left >= right);
      case ConditionOperator.enum.less_than:
        return this.compareOrdered(eventValue, condition.value, (left, right) => left < right);
      case ConditionOperator.enum.less_than_or_equal:
        return this.compareOrdered(eventValue, condition.value, (left, right) => left <= right);
      case ConditionOperator.enum.in:
        if (!Array.isArray(condition.value)) {
          return false;
        }
        return condition.value.includes(eventValue);
      case ConditionOperator.enum.not_in:
        if (!Array.isArray(condition.value)) {
          return true;
        }
        return !condition.value.includes(eventValue);
      case ConditionOperator.enum.exists:
        return eventValue !== undefined && eventValue !== null;
      default:
        return false;
    }
  }
}