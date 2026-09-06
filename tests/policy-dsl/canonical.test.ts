import { PolicyDslService } from '../../src/application/policies/PolicyDslService';
import {
  compilePolicyDsl,
  parsePolicyDsl,
  policyVersionToDsl,
  serializePolicyDsl
} from '../../src/domain/policies/dsl';
import {
  ACTIVE_COMPILE_OPTIONS,
  BUSINESS_MEALS_DSL,
  DEFAULT_COMPILE_OPTIONS,
  REVERSE_ACCOUNT_MAP
} from './fixtures';

const ROUND_TRIP_DSL = `POLICY "Round Trip"
VERSION 4
EFFECTIVE FROM "2026-01-01"
EFFECTIVE TO "2026-12-31"

RULE "meals"
PRIORITY 100
WHEN
eventType = "PURCHASE"
AND (counterparty IN ["Starbucks", "Peet's"] OR attributes.vip = true)
AND NOT amount < 10
AND attributes.taxAmount EXISTS
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT DESCRIPTION "Meals"
DEBIT ACCOUNT "1800" AMOUNT FIXED_AMOUNT 1.25 "USD"
CREDIT ACCOUNT "2000" AMOUNT ATTRIBUTE_AMOUNT cardAmount DESCRIPTION "He said \\"hello\\""
`;

describe('SUTRA Policy DSL canonicalization', () => {
  it('canonicalizes DSL through parse → serialize → parse', () => {
    const first = serializePolicyDsl(parsePolicyDsl(ROUND_TRIP_DSL));
    const second = serializePolicyDsl(parsePolicyDsl(first));
    expect(second).toBe(first);
  });

  it('round-trips DSL → PolicyIR → canonical DSL → PolicyIR', () => {
    const first = compilePolicyDsl(ROUND_TRIP_DSL, DEFAULT_COMPILE_OPTIONS);
    const canonical = serializePolicyDsl(policyVersionToDsl(first, {
      policyName: 'Round Trip',
      accounts: REVERSE_ACCOUNT_MAP
    }));
    const second = compilePolicyDsl(canonical, DEFAULT_COMPILE_OPTIONS);

    expect(second.definition).toEqual(first.definition);
    expect(second.id).toBe(first.id);
    expect(second.policyId).toBe(first.policyId);
    expect(second.version).toBe(first.version);
    expect(second.effectiveFrom).toEqual(first.effectiveFrom);
    expect(second.effectiveTo).toEqual(first.effectiveTo);
  });

  it('round-trips the representative Business Meals policy', () => {
    const service = new PolicyDslService();
    const compiled = service.compile(BUSINESS_MEALS_DSL, ACTIVE_COMPILE_OPTIONS);
    const canonical = service.serializePolicyVersion(compiled, {
      policyName: 'Business Meals',
      accounts: REVERSE_ACCOUNT_MAP
    });
    const again = service.compile(canonical, ACTIVE_COMPILE_OPTIONS);
    expect(again.definition).toEqual(compiled.definition);
  });
});
