import {
  DslCondition,
  DslPolicy,
  parsePolicyDsl,
  tokenizePolicyDsl
} from '../../src/domain/policies/dsl';
import { BUSINESS_MEALS_DSL, expectPolicyDslError } from './fixtures';

function withoutLoc<T extends { loc: { line: number; column: number } }>(
  node: T
): Omit<T, 'loc'> {
  const { loc: _loc, ...rest } = node;
  return rest;
}

function conditionShape(condition: DslCondition): unknown {
  switch (condition.kind) {
    case 'compare':
      return {
        kind: 'compare',
        field: condition.field,
        operator: condition.operator,
        value: condition.value
      };
    case 'in':
      return {
        kind: 'in',
        field: condition.field,
        negated: condition.negated,
        values: condition.values
      };
    case 'exists':
      return { kind: 'exists', field: condition.field };
    case 'and':
      return { kind: 'and', items: condition.items.map(conditionShape) };
    case 'or':
      return { kind: 'or', items: condition.items.map(conditionShape) };
    case 'not':
      return { kind: 'not', item: conditionShape(condition.item) };
  }
}

function policyShape(policy: DslPolicy): unknown {
  return {
    name: policy.name,
    version: policy.version,
    effectiveFrom: policy.effectiveFrom,
    effectiveTo: policy.effectiveTo,
    rules: policy.rules.map((rule) => ({
      name: rule.name,
      priority: rule.priority,
      when: conditionShape(rule.when),
      lines: rule.lines.map((line) => withoutLoc(line))
    }))
  };
}

describe('SUTRA Policy DSL parser', () => {
  it('parses a simple two-line purchase policy', () => {
    const policy = parsePolicyDsl(BUSINESS_MEALS_DSL);

    expect(policy.name).toBe('Business Meals');
    expect(policy.version).toBe(1);
    expect(policy.effectiveFrom).toBe('2026-01-01');
    expect(policy.effectiveTo).toBeUndefined();
    expect(policy.rules).toHaveLength(1);
    const rule = policy.rules[0];
    if (rule === undefined) {
      throw new Error('expected a parsed rule');
    }
    expect(rule.name).toBe('Starbucks over threshold');
    expect(rule.priority).toBe(100);
    expect(conditionShape(rule.when)).toEqual({
      kind: 'and',
      items: [
        { kind: 'compare', field: 'eventType', operator: '=', value: 'PURCHASE' },
        { kind: 'compare', field: 'counterparty', operator: '=', value: 'Starbucks' },
        { kind: 'compare', field: 'amount', operator: '>', value: 5000 }
      ]
    });
    expect(rule.lines).toEqual([
      expect.objectContaining({
        side: 'DEBIT',
        accountCode: '5220',
        amount: { kind: 'event' }
      }),
      expect.objectContaining({
        side: 'CREDIT',
        accountCode: '2000',
        amount: { kind: 'event' }
      })
    ]);
  });

  it('parses the same DSL into the same representation', () => {
    const first = policyShape(parsePolicyDsl(BUSINESS_MEALS_DSL));
    const second = policyShape(parsePolicyDsl(BUSINESS_MEALS_DSL));
    expect(first).toEqual(second);
    expect(tokenizePolicyDsl(BUSINESS_MEALS_DSL)).toEqual(tokenizePolicyDsl(BUSINESS_MEALS_DSL));
  });

  it('parses multi-line treatments, descriptions, and amount expressions', () => {
    const policy = parsePolicyDsl(`
POLICY "Split Expense"
VERSION 2
EFFECTIVE FROM "2026-01-01"
EFFECTIVE TO "2026-12-31"

RULE "Split travel"
PRIORITY 50

WHEN
eventType = "PURCHASE"
AND attributes.invoiceType = "SPLIT"

THEN
DEBIT ACCOUNT "5100" AMOUNT ATTRIBUTE_AMOUNT travelAmount DESCRIPTION "Travel portion"
DEBIT ACCOUNT "5220" AMOUNT FIXED_AMOUNT 12.5 "USD" DESCRIPTION "Fixed fee"
DEBIT ACCOUNT "1800" AMOUNT ATTRIBUTE_AMOUNT taxAmount
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT DESCRIPTION "Card payment"
`);

    expect(policy.version).toBe(2);
    expect(policy.effectiveTo).toBe('2026-12-31');
    expect(policy.rules[0]?.lines).toEqual([
      expect.objectContaining({
        side: 'DEBIT',
        accountCode: '5100',
        amount: { kind: 'attribute', attribute: 'travelAmount' },
        description: 'Travel portion'
      }),
      expect.objectContaining({
        side: 'DEBIT',
        accountCode: '5220',
        amount: { kind: 'fixed', value: 12.5, currency: 'USD' },
        description: 'Fixed fee'
      }),
      expect.objectContaining({
        side: 'DEBIT',
        accountCode: '1800',
        amount: { kind: 'attribute', attribute: 'taxAmount' }
      }),
      expect.objectContaining({
        side: 'CREDIT',
        accountCode: '2000',
        amount: { kind: 'event' },
        description: 'Card payment'
      })
    ]);
  });

  it('parses AND, OR, NOT, grouping, IN, NOT IN, EXISTS, and comparisons', () => {
    const policy = parsePolicyDsl(`
POLICY "Operators"
VERSION 1
EFFECTIVE FROM "2026-01-01"

RULE "logic"
PRIORITY 1

WHEN
NOT eventType = "REFUND"
AND (counterparty IN ["Starbucks", "Peet's"] OR counterparty NOT IN ["Unknown"])
AND amount >= 10
AND amount <= 9000
AND amount != 0
AND currency = "USD"
AND attributes.flag = true
AND attributes.note != null
AND attributes.taxAmount EXISTS
AND (amount > 100 OR amount < 5)

THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`);

    const rule = policy.rules[0];
    if (rule === undefined) {
      throw new Error('expected a parsed rule');
    }
    expect(conditionShape(rule.when)).toEqual({
      kind: 'and',
      items: [
        {
          kind: 'not',
          item: { kind: 'compare', field: 'eventType', operator: '=', value: 'REFUND' }
        },
        {
          kind: 'or',
          items: [
            {
              kind: 'in',
              field: 'counterparty',
              negated: false,
              values: ['Starbucks', "Peet's"]
            },
            {
              kind: 'in',
              field: 'counterparty',
              negated: true,
              values: ['Unknown']
            }
          ]
        },
        { kind: 'compare', field: 'amount', operator: '>=', value: 10 },
        { kind: 'compare', field: 'amount', operator: '<=', value: 9000 },
        { kind: 'compare', field: 'amount', operator: '!=', value: 0 },
        { kind: 'compare', field: 'currency', operator: '=', value: 'USD' },
        { kind: 'compare', field: 'attributes.flag', operator: '=', value: true },
        { kind: 'compare', field: 'attributes.note', operator: '!=', value: null },
        { kind: 'exists', field: 'attributes.taxAmount' },
        {
          kind: 'or',
          items: [
            { kind: 'compare', field: 'amount', operator: '>', value: 100 },
            { kind: 'compare', field: 'amount', operator: '<', value: 5 }
          ]
        }
      ]
    });
  });

  it('parses multiple rules and preserves declaration order', () => {
    const policy = parsePolicyDsl(`
POLICY "Priorities"
VERSION 1
EFFECTIVE FROM "2026-03-01"

RULE "low"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT

RULE "high"
PRIORITY 200
WHEN eventType = "REFUND"
THEN
DEBIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
`);

    expect(policy.rules.map((rule) => rule.name)).toEqual(['low', 'high']);
    expect(policy.rules.map((rule) => rule.priority)).toEqual([1, 200]);
  });

  it('binds AND tighter than OR', () => {
    const policy = parsePolicyDsl(`
POLICY "Precedence"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE" OR eventType = "REFUND" AND amount > 10
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`);

    const rule = policy.rules[0];
    if (rule === undefined) {
      throw new Error('expected a parsed rule');
    }
    expect(conditionShape(rule.when)).toEqual({
      kind: 'or',
      items: [
        { kind: 'compare', field: 'eventType', operator: '=', value: 'PURCHASE' },
        {
          kind: 'and',
          items: [
            { kind: 'compare', field: 'eventType', operator: '=', value: 'REFUND' },
            { kind: 'compare', field: 'amount', operator: '>', value: 10 }
          ]
        }
      ]
    });
  });

  it('rejects unknown keywords and operators with location', () => {
    expectPolicyDslError(
      () => parsePolicyDsl('MATCH "x"'),
      'Unknown keyword MATCH'
    );
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType ~ "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Unexpected character "~"'
    );
  });
});
