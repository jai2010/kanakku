import { z } from 'zod';
import { Account } from '../accounting/Account';
import { AmountExpressionSchema } from '../accounting/AccountingTreatment';
import { parseDomain } from '../parse';
import { Condition, ConditionSchema, PolicyIRSchema, WhenClause } from './PolicyIR';
import { PolicyVersion, PolicyVersionSchema } from './PolicyVersion';

export const PolicyValidationIssueCode = z.enum([
  'POLICY_IR_INVALID',
  'INVALID_RULE_STRUCTURE',
  'INVALID_CONDITION',
  'INVALID_ACCOUNT',
  'INVALID_AMOUNT',
  'INVALID_TREATMENT',
  'ONE_SIDED_TREATMENT',
  'INVALID_PRIORITY',
  'INVALID_EFFECTIVE_DATES',
  'CONFLICTING_RULES',
  'TENANT_MISMATCH',
  'INVALID_LIFECYCLE'
]);

export type PolicyValidationIssueCode = z.infer<typeof PolicyValidationIssueCode>;

export const PolicyValidationIssueSchema = z.object({
  code: PolicyValidationIssueCode,
  message: z.string(),
  ruleId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional()
});

export type PolicyValidationIssue = z.infer<typeof PolicyValidationIssueSchema>;

export const PolicyValidationResultSchema = z.object({
  valid: z.boolean(),
  policyVersionId: z.string().optional(),
  issues: z.array(PolicyValidationIssueSchema)
});

export type PolicyValidationResult = z.infer<typeof PolicyValidationResultSchema>;

export function createPolicyValidationResult(input: PolicyValidationResult): PolicyValidationResult {
  return parseDomain(PolicyValidationResultSchema, input, 'PolicyValidationResult');
}

export function collectStructuralPolicyIssues(version: PolicyVersion): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];
  const parsedIr = PolicyIRSchema.safeParse(version.definition);
  if (!parsedIr.success) {
    issues.push({
      code: 'POLICY_IR_INVALID',
      message: 'PolicyIR is malformed'
    });
    return issues;
  }

  if (
    version.effectiveTo !== undefined &&
    version.effectiveTo.getTime() < version.effectiveFrom.getTime()
  ) {
    issues.push({
      code: 'INVALID_EFFECTIVE_DATES',
      message: 'effectiveTo is before effectiveFrom'
    });
  }

  if (Number.isNaN(version.effectiveFrom.getTime())) {
    issues.push({
      code: 'INVALID_EFFECTIVE_DATES',
      message: 'effectiveFrom is invalid'
    });
  }

  const priorities = new Map<number, string[]>();
  const ruleIds = new Set<string>();

  for (const rule of parsedIr.data.rules) {
    if (ruleIds.has(rule.id)) {
      issues.push({
        code: 'INVALID_RULE_STRUCTURE',
        message: `Duplicate rule id ${rule.id}`,
        ruleId: rule.id
      });
    }
    ruleIds.add(rule.id);

    if (!Number.isInteger(rule.priority) || !Number.isFinite(rule.priority)) {
      issues.push({
        code: 'INVALID_PRIORITY',
        message: 'Rule priority must be a finite integer',
        ruleId: rule.id
      });
    } else {
      const existing = priorities.get(rule.priority);
      if (existing === undefined) {
        priorities.set(rule.priority, [rule.id]);
      } else {
        existing.push(rule.id);
      }
    }

    issues.push(...collectWhenIssues(rule.when, rule.id));

    const lines = rule.then.treatment.lines;
    if (lines.length < 2) {
      issues.push({
        code: 'INVALID_TREATMENT',
        message: 'Treatment must contain at least two journal lines',
        ruleId: rule.id
      });
    }

    const hasDebit = lines.some((line) => line.side === 'DEBIT');
    const hasCredit = lines.some((line) => line.side === 'CREDIT');
    if (lines.length >= 2 && (!hasDebit || !hasCredit)) {
      issues.push({
        code: 'ONE_SIDED_TREATMENT',
        message: 'Treatment must contain at least one DEBIT and one CREDIT',
        ruleId: rule.id
      });
    }

    for (const line of lines) {
      const amount = AmountExpressionSchema.safeParse(line.amount);
      if (!amount.success) {
        issues.push({
          code: 'INVALID_AMOUNT',
          message: 'Invalid amount expression',
          ruleId: rule.id,
          accountId: line.accountId
        });
      }
    }
  }

  for (const [priority, ids] of priorities.entries()) {
    if (ids.length > 1) {
      issues.push({
        code: 'CONFLICTING_RULES',
        message: `Multiple rules share priority ${priority}`,
        ruleId: ids[0]
      });
    }
  }

  return issues;
}

export function collectAccountPolicyIssues(
  version: PolicyVersion,
  accounts: ReadonlyMap<string, Account>
): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];
  const parsedIr = PolicyIRSchema.safeParse(version.definition);
  if (!parsedIr.success) {
    return issues;
  }

  for (const rule of parsedIr.data.rules) {
    for (const line of rule.then.treatment.lines) {
      const account = accounts.get(line.accountId);
      if (account === undefined) {
        issues.push({
          code: 'INVALID_ACCOUNT',
          message: `Account not found: ${line.accountId}`,
          ruleId: rule.id,
          accountId: line.accountId
        });
        continue;
      }
      if (account.status !== 'ACTIVE') {
        issues.push({
          code: 'INVALID_ACCOUNT',
          message: `Account is not ACTIVE: ${line.accountId}`,
          ruleId: rule.id,
          accountId: line.accountId
        });
      }
      if (account.tenantId !== version.tenantId) {
        issues.push({
          code: 'TENANT_MISMATCH',
          message: `Account tenant does not match policy tenant: ${line.accountId}`,
          ruleId: rule.id,
          accountId: line.accountId
        });
      }
    }
  }

  return issues;
}

export function parsePolicyVersionForValidation(input: unknown): {
  version?: PolicyVersion;
  issues: PolicyValidationIssue[];
} {
  const parsed = PolicyVersionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: [{
        code: 'POLICY_IR_INVALID',
        message: 'Malformed PolicyVersion or PolicyIR'
      }]
    };
  }
  return { version: parsed.data, issues: [] };
}

function collectWhenIssues(when: WhenClause, ruleId: string): PolicyValidationIssue[] {
  if (isAnd(when)) {
    if (when.AND.length === 0) {
      return [{ code: 'INVALID_CONDITION', message: 'AND group must not be empty', ruleId }];
    }
    return when.AND.flatMap((item) => collectWhenIssues(item, ruleId));
  }
  if (isOr(when)) {
    if (when.OR.length === 0) {
      return [{ code: 'INVALID_CONDITION', message: 'OR group must not be empty', ruleId }];
    }
    return when.OR.flatMap((item) => collectWhenIssues(item, ruleId));
  }
  if (isNot(when)) {
    return collectWhenIssues(when.NOT, ruleId);
  }
  return collectConditionIssues(when, ruleId);
}

function collectConditionIssues(condition: Condition, ruleId: string): PolicyValidationIssue[] {
  const parsed = ConditionSchema.safeParse(condition);
  if (!parsed.success) {
    return [{ code: 'INVALID_CONDITION', message: 'Malformed condition', ruleId }];
  }
  if (parsed.data.field.trim().length === 0) {
    return [{ code: 'INVALID_CONDITION', message: 'Condition field must not be empty', ruleId }];
  }
  if (
    (parsed.data.operator === 'in' || parsed.data.operator === 'not_in') &&
    !Array.isArray(parsed.data.value)
  ) {
    return [{ code: 'INVALID_CONDITION', message: 'IN/NOT IN value must be an array', ruleId }];
  }
  return [];
}

function isAnd(when: WhenClause): when is { AND: WhenClause[] } {
  return typeof when === 'object' && when !== null && 'AND' in when;
}

function isOr(when: WhenClause): when is { OR: WhenClause[] } {
  return typeof when === 'object' && when !== null && 'OR' in when;
}

function isNot(when: WhenClause): when is { NOT: WhenClause } {
  return typeof when === 'object' && when !== null && 'NOT' in when;
}
