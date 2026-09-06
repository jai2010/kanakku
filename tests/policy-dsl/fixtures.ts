import { id } from '../fixtures/ids';
import { PolicyDslError } from '../../src/domain/policies/dsl';
import { PolicyDslCompileOptions } from '../../src/domain/policies/dsl';

export const TENANT_ID = id('dsl-tenant');
export const ACCOUNT_5220 = id('dsl-acc-5220');
export const ACCOUNT_2000 = id('dsl-acc-2000');
export const ACCOUNT_1000 = id('dsl-acc-1000');
export const ACCOUNT_1800 = id('dsl-acc-1800');
export const ACCOUNT_5100 = id('dsl-acc-5100');

export const ACCOUNT_MAP: ReadonlyMap<string, string> = new Map([
  ['5220', ACCOUNT_5220],
  ['2000', ACCOUNT_2000],
  ['1000', ACCOUNT_1000],
  ['1800', ACCOUNT_1800],
  ['5100', ACCOUNT_5100]
]);

export const REVERSE_ACCOUNT_MAP: ReadonlyMap<string, string> = new Map(
  Array.from(ACCOUNT_MAP.entries()).map(([code, accountId]) => [accountId, code])
);

export const DEFAULT_COMPILE_OPTIONS: PolicyDslCompileOptions = {
  tenantId: TENANT_ID,
  accounts: ACCOUNT_MAP,
  status: 'DRAFT',
  createdAt: new Date(0)
};

export const ACTIVE_COMPILE_OPTIONS: PolicyDslCompileOptions = {
  ...DEFAULT_COMPILE_OPTIONS,
  status: 'ACTIVE'
};

export const BUSINESS_MEALS_DSL = `POLICY "Business Meals"
VERSION 1
EFFECTIVE FROM "2026-01-01"

RULE "Starbucks over threshold"
PRIORITY 100

WHEN
eventType = "PURCHASE"
AND counterparty = "Starbucks"
AND amount > 5000

THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`;

export function expectPolicyDslError(run: () => unknown, message: string): PolicyDslError {
  try {
    run();
  } catch (error) {
    if (!(error instanceof PolicyDslError)) {
      throw error;
    }
    expect(error.message).toContain(message);
    expect(error.line).toBeGreaterThan(0);
    expect(error.column).toBeGreaterThan(0);
    return error;
  }
  throw new Error(`Expected PolicyDslError containing ${JSON.stringify(message)}`);
}
