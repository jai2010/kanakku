import { AmountExpression } from '../../accounting/AccountingTreatment';
import { Condition, ConditionOperator, WhenClause } from '../PolicyIR';
import { PolicyVersion } from '../PolicyVersion';
import { DslAmount, DslCompareOperator, DslCondition, DslLine, DslPolicy, DslValue } from './ast';
import { PolicyDslError } from './errors';

export type PolicyIrSerializeOptions = {
  policyName: string;
  accounts: ReadonlyMap<string, string>;
};

const COMPARE_FROM_IR: Partial<Record<ConditionOperator, DslCompareOperator>> = {
  equals: '=',
  not_equals: '!=',
  greater_than: '>',
  greater_than_or_equal: '>=',
  less_than: '<',
  less_than_or_equal: '<='
};

export function policyVersionToDsl(version: PolicyVersion, options: PolicyIrSerializeOptions): DslPolicy {
  return {
    name: options.policyName,
    version: version.version,
    effectiveFrom: toIsoDate(version.effectiveFrom),
    ...(version.effectiveTo !== undefined ? { effectiveTo: toIsoDate(version.effectiveTo) } : {}),
    rules: version.definition.rules.map((rule, index) => ({
      name: `rule-${index + 1}`,
      priority: rule.priority,
      when: whenToDsl(rule.when),
      lines: rule.then.treatment.lines.map((line) => {
        const accountCode = options.accounts.get(line.accountId);
        if (accountCode === undefined) {
          throw new PolicyDslError(`Unknown account id ${line.accountId}`, 1, 1);
        }
        const dslLine: DslLine = {
          side: line.side,
          accountCode,
          amount: amountToDsl(line.amount),
          loc: { line: 1, column: 1 }
        };
        if (line.description !== undefined) {
          dslLine.description = line.description;
        }
        return dslLine;
      }),
      loc: { line: 1, column: 1 }
    })),
    loc: { line: 1, column: 1 }
  };
}

function whenToDsl(when: WhenClause): DslCondition {
  const loc = { line: 1, column: 1 };
  if (isAnd(when)) {
    return { kind: 'and', items: when.AND.map(whenToDsl), loc };
  }
  if (isOr(when)) {
    return { kind: 'or', items: when.OR.map(whenToDsl), loc };
  }
  if (isNot(when)) {
    return { kind: 'not', item: whenToDsl(when.NOT), loc };
  }
  return conditionToDsl(when);
}

function conditionToDsl(condition: Condition): DslCondition {
  const loc = { line: 1, column: 1 };
  if (condition.operator === 'exists') {
    return { kind: 'exists', field: condition.field, loc };
  }
  if (condition.operator === 'in' || condition.operator === 'not_in') {
    if (!Array.isArray(condition.value)) {
      throw new PolicyDslError('IN/NOT IN value must be an array', 1, 1);
    }
    return {
      kind: 'in',
      field: condition.field,
      negated: condition.operator === 'not_in',
      values: condition.value.map(toDslValue),
      loc
    };
  }
  const operator = COMPARE_FROM_IR[condition.operator];
  if (operator === undefined) {
    throw new PolicyDslError(`Unsupported operator ${condition.operator}`, 1, 1);
  }
  return {
    kind: 'compare',
    field: condition.field,
    operator,
    value: toDslValue(condition.value),
    loc
  };
}

function amountToDsl(amount: AmountExpression): DslAmount {
  if (amount.type === 'EVENT_AMOUNT') {
    return { kind: 'event' };
  }
  if (amount.type === 'FIXED_AMOUNT') {
    if (amount.value === undefined || amount.currency === undefined) {
      throw new PolicyDslError('FIXED_AMOUNT is missing value or currency', 1, 1);
    }
    return { kind: 'fixed', value: amount.value, currency: amount.currency };
  }
  if (amount.type === 'RATE_AMOUNT') {
    if (amount.rate === undefined) {
      throw new PolicyDslError('RATE_AMOUNT is missing rate', 1, 1);
    }
    return { kind: 'rate', rate: amount.rate };
  }
  if (amount.attribute === undefined) {
    throw new PolicyDslError('ATTRIBUTE_AMOUNT is missing attribute', 1, 1);
  }
  return { kind: 'attribute', attribute: amount.attribute };
}

function toDslValue(value: unknown): DslValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  throw new PolicyDslError('Unsupported condition value', 1, 1);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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
