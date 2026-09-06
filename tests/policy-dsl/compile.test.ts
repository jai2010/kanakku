import { PolicyDslService } from '../../src/application/policies/PolicyDslService';
import { compilePolicyDsl, parsePolicyDsl } from '../../src/domain/policies/dsl';
import { WhenClause } from '../../src/domain/policies/PolicyIR';
import {
  ACCOUNT_2000,
  ACCOUNT_5220,
  ACCOUNT_5100,
  ACCOUNT_1800,
  ACTIVE_COMPILE_OPTIONS,
  BUSINESS_MEALS_DSL,
  DEFAULT_COMPILE_OPTIONS,
  TENANT_ID,
  expectPolicyDslError
} from './fixtures';

describe('SUTRA Policy DSL compiler', () => {
  it('compiles DSL into existing PolicyIR and PolicyVersion metadata', () => {
    const version = compilePolicyDsl(BUSINESS_MEALS_DSL, DEFAULT_COMPILE_OPTIONS);

    expect(version.tenantId).toBe(TENANT_ID);
    expect(version.version).toBe(1);
    expect(version.status).toBe('DRAFT');
    expect(version.effectiveFrom.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(version.effectiveTo).toBeUndefined();
    expect(version.createdAt.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(version.definition.rules).toHaveLength(1);

    const rule = version.definition.rules[0];
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(100);
    expect(rule?.when).toEqual({
      AND: [
        { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
        { field: 'amount', operator: 'greater_than', value: 5000 }
      ]
    });
    expect(rule?.then.treatment.lines).toEqual([
      { accountId: ACCOUNT_5220, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
      { accountId: ACCOUNT_2000, side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
    ]);
  });

  it('is deterministic for the same DSL and compile options', () => {
    const first = compilePolicyDsl(BUSINESS_MEALS_DSL, DEFAULT_COMPILE_OPTIONS);
    const second = compilePolicyDsl(BUSINESS_MEALS_DSL, DEFAULT_COMPILE_OPTIONS);
    expect(first).toEqual(second);
  });

  it('preserves rule order, priorities, dates, and multi-line treatments', () => {
    const version = compilePolicyDsl(`
POLICY "Dated"
VERSION 3
EFFECTIVE FROM "2026-02-01"
EFFECTIVE TO "2026-06-30"

RULE "first"
PRIORITY 10
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5100" AMOUNT ATTRIBUTE_AMOUNT travelAmount DESCRIPTION "Travel"
DEBIT ACCOUNT "1800" AMOUNT FIXED_AMOUNT 25 "USD" DESCRIPTION "Tax"
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT DESCRIPTION "Payable"

RULE "second"
PRIORITY 99
WHEN eventType = "REFUND"
THEN
DEBIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
`, DEFAULT_COMPILE_OPTIONS);

    expect(version.version).toBe(3);
    expect(version.effectiveFrom.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(version.effectiveTo?.toISOString()).toBe('2026-06-30T00:00:00.000Z');
    expect(version.definition.rules.map((rule) => rule.priority)).toEqual([10, 99]);
    expect(version.definition.rules[0]?.then.treatment.lines).toEqual([
      {
        accountId: ACCOUNT_5100,
        side: 'DEBIT',
        amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'travelAmount' },
        description: 'Travel'
      },
      {
        accountId: ACCOUNT_1800,
        side: 'DEBIT',
        amount: { type: 'FIXED_AMOUNT', value: 25, currency: 'USD' },
        description: 'Tax'
      },
      {
        accountId: ACCOUNT_2000,
        side: 'CREDIT',
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Payable'
      }
    ]);
  });

  it('compiles logical operators onto existing WhenClause shapes', () => {
    const version = compilePolicyDsl(`
POLICY "Logic"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN
eventType IN ["PURCHASE", "PAYMENT"]
OR NOT counterparty = "Unknown"
AND attributes.taxAmount EXISTS
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`, DEFAULT_COMPILE_OPTIONS);

    const when: WhenClause | undefined = version.definition.rules[0]?.when;
    expect(when).toEqual({
      OR: [
        { field: 'eventType', operator: 'in', value: ['PURCHASE', 'PAYMENT'] },
        {
          AND: [
            { NOT: { field: 'counterparty', operator: 'equals', value: 'Unknown' } },
            { field: 'attributes.taxAmount', operator: 'exists', value: true }
          ]
        }
      ]
    });
  });

  it('does not invent accounts or execute accounting', () => {
    expectPolicyDslError(
      () => compilePolicyDsl(BUSINESS_MEALS_DSL, {
        ...DEFAULT_COMPILE_OPTIONS,
        accounts: new Map()
      }),
      'Unknown account "5220"'
    );
  });

  it('exposes compile through PolicyDslService without replacing PolicyIR APIs', () => {
    const service = new PolicyDslService();
    const parsed = service.parse(BUSINESS_MEALS_DSL);
    const compiled = service.compile(BUSINESS_MEALS_DSL, ACTIVE_COMPILE_OPTIONS);
    expect(parsed.name).toBe('Business Meals');
    expect(compiled.status).toBe('ACTIVE');
    expect(compiled.definition.rules[0]?.then.treatment.lines[0]?.accountId).toBe(ACCOUNT_5220);
    expect(parsePolicyDsl(BUSINESS_MEALS_DSL).name).toBe(parsed.name);
  });
});
