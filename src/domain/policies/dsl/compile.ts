import { AmountExpression } from '../../accounting/AccountingTreatment';
import { isEventAttributeIdentifier } from '../../events/resolveEventField';
import { ConditionOperator, PolicyIR, WhenClause, createPolicyIR } from '../PolicyIR';
import { PolicyVersion, PolicyVersionStatus, createPolicyVersion } from '../PolicyVersion';
import { DslAmount, DslCompareOperator, DslCondition, DslLocation, DslPolicy } from './ast';
import { PolicyDslError } from './errors';
import { deterministicDslId } from './ids';
import { parsePolicyDsl } from './parser';

export type PolicyDslCompileOptions = {
  tenantId: string;
  accounts: ReadonlyMap<string, string>;
  status?: PolicyVersionStatus;
  createdAt?: Date;
};

const COMPARE_OPERATORS: Record<DslCompareOperator, ConditionOperator> = {
  '=': 'equals',
  '!=': 'not_equals',
  '>': 'greater_than',
  '>=': 'greater_than_or_equal',
  '<': 'less_than',
  '<=': 'less_than_or_equal'
};

export function compilePolicyDsl(source: string, options: PolicyDslCompileOptions): PolicyVersion {
  return compilePolicyAst(parsePolicyDsl(source), options);
}

export function compilePolicyAst(ast: DslPolicy, options: PolicyDslCompileOptions): PolicyVersion {
  const effectiveFrom = parseIsoDate(ast.effectiveFrom, ast.loc, 'EFFECTIVE FROM');
  const effectiveTo = ast.effectiveTo === undefined
    ? undefined
    : parseIsoDate(ast.effectiveTo, ast.loc, 'EFFECTIVE TO');
  if (effectiveTo !== undefined && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw new PolicyDslError('EFFECTIVE TO is before EFFECTIVE FROM', ast.loc.line, ast.loc.column);
  }

  const ir: PolicyIR = createPolicyIR({
    rules: ast.rules.map((rule, index) => {
      if (rule.lines.length < 2) {
        throw new PolicyDslError('THEN must contain at least two journal lines', rule.loc.line, rule.loc.column);
      }
      const hasDebit = rule.lines.some((line) => line.side === 'DEBIT');
      const hasCredit = rule.lines.some((line) => line.side === 'CREDIT');
      if (!hasDebit || !hasCredit) {
        throw new PolicyDslError(
          'THEN must contain at least one DEBIT and one CREDIT',
          rule.loc.line,
          rule.loc.column
        );
      }
      return {
        id: deterministicDslId(`sutra:rule:${options.tenantId}:${ast.name}:${ast.version}:${index}`),
        priority: rule.priority,
        when: compileCondition(rule.when),
        then: {
          treatment: {
            lines: rule.lines.map((line) => {
              const accountId = options.accounts.get(line.accountCode);
              if (accountId === undefined) {
                throw new PolicyDslError(
                  `Unknown account ${JSON.stringify(line.accountCode)}`,
                  line.loc.line,
                  line.loc.column
                );
              }
              return {
                accountId,
                side: line.side,
                amount: compileAmount(line.amount, line.loc),
                ...(line.description !== undefined ? { description: line.description } : {})
              };
            })
          }
        }
      };
    })
  });

  return createPolicyVersion({
    id: deterministicDslId(`sutra:policy-version:${options.tenantId}:${ast.name}:${ast.version}`),
    policyId: deterministicDslId(`sutra:policy:${options.tenantId}:${ast.name}`),
    tenantId: options.tenantId,
    version: ast.version,
    effectiveFrom,
    effectiveTo,
    status: options.status ?? 'DRAFT',
    definition: ir,
    createdAt: options.createdAt ?? new Date(0)
  });
}

function compileCondition(condition: DslCondition): WhenClause {
  switch (condition.kind) {
    case 'compare':
      return {
        field: condition.field,
        operator: COMPARE_OPERATORS[condition.operator],
        value: condition.value
      };
    case 'in':
      if (condition.values.length === 0) {
        throw new PolicyDslError('IN/NOT IN list must not be empty', condition.loc.line, condition.loc.column);
      }
      return {
        field: condition.field,
        operator: condition.negated ? 'not_in' : 'in',
        value: condition.values
      };
    case 'exists':
      return {
        field: condition.field,
        operator: 'exists',
        value: true
      };
    case 'and':
      if (condition.items.length === 0) {
        throw new PolicyDslError('AND group must not be empty', condition.loc.line, condition.loc.column);
      }
      return { AND: condition.items.map(compileCondition) };
    case 'or':
      if (condition.items.length === 0) {
        throw new PolicyDslError('OR group must not be empty', condition.loc.line, condition.loc.column);
      }
      return { OR: condition.items.map(compileCondition) };
    case 'not':
      return { NOT: compileCondition(condition.item) };
  }
}

function compileAmount(amount: DslAmount, loc: DslLocation): AmountExpression {
  if (amount.kind === 'event') {
    return { type: 'EVENT_AMOUNT' };
  }
  if (amount.kind === 'fixed') {
    return { type: 'FIXED_AMOUNT', value: amount.value, currency: amount.currency };
  }
  if (amount.kind === 'rate') {
    return { type: 'RATE_AMOUNT', rate: amount.rate };
  }
  if (!isEventAttributeIdentifier(amount.attribute)) {
    throw new PolicyDslError(
      `Invalid ATTRIBUTE_AMOUNT identifier ${JSON.stringify(amount.attribute)}`,
      loc.line,
      loc.column
    );
  }
  return { type: 'ATTRIBUTE_AMOUNT', attribute: amount.attribute };
}

function parseIsoDate(value: string, loc: DslLocation, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PolicyDslError(`${label} must be YYYY-MM-DD`, loc.line, loc.column);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new PolicyDslError(`Invalid ${label} date`, loc.line, loc.column);
  }
  return date;
}


