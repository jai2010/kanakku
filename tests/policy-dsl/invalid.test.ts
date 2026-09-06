import { compilePolicyDsl, parsePolicyDsl } from '../../src/domain/policies/dsl';
import { DEFAULT_COMPILE_OPTIONS, expectPolicyDslError } from './fixtures';

function compile(source: string): void {
  compilePolicyDsl(source, DEFAULT_COMPILE_OPTIONS);
}

describe('SUTRA Policy DSL invalid programs', () => {
  it('rejects unknown keyword', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
WHENEVER eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Unknown keyword WHENEVER'
    );
  });

  it('rejects missing POLICY', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected POLICY'
    );
  });

  it('rejects missing VERSION', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected VERSION'
    );
  });

  it('rejects missing THEN', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected THEN'
    );
  });

  it('rejects malformed WHEN', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected field name'
    );
  });

  it('rejects malformed condition', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected comparison operator'
    );
  });

  it('rejects malformed account', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT 5220 AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected account code'
    );
  });

  it('rejects empty account code', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Account code must not be empty'
    );
  });

  it('rejects missing amount expression', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220"
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected AMOUNT'
    );
  });

  it('rejects malformed debit/credit line', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected ACCOUNT'
    );
  });

  it('rejects duplicate structural declarations', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
EFFECTIVE FROM "2026-02-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Duplicate EFFECTIVE FROM'
    );

    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
RULE "r"
PRIORITY 2
WHEN eventType = "REFUND"
THEN
DEBIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
`),
      'Duplicate RULE name'
    );
  });

  it('rejects malformed logical groups', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN (eventType = "PURCHASE" AND)
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected field name'
    );

    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN (eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Expected RPAREN'
    );
  });

  it('rejects invalid priority', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1.5
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'PRIORITY must be an integer'
    );
  });

  it('rejects invalid dates', () => {
    expectPolicyDslError(
      () => compile(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "not-a-date"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'EFFECTIVE FROM must be YYYY-MM-DD'
    );

    expectPolicyDslError(
      () => compile(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-13-40"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Invalid EFFECTIVE FROM date'
    );

    expectPolicyDslError(
      () => compile(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-06-01"
EFFECTIVE TO "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'EFFECTIVE TO is before EFFECTIVE FROM'
    );
  });

  it('rejects empty treatment', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
RULE "other"
PRIORITY 2
WHEN eventType = "REFUND"
THEN
DEBIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
`),
      'Expected DEBIT or CREDIT after THEN'
    );
  });

  it('rejects one-sided journal treatment', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
DEBIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'THEN must contain at least one DEBIT and one CREDIT'
    );
  });

  it('rejects missing EFFECTIVE FROM and empty names', () => {
    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY "x"
VERSION 1
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'Missing EFFECTIVE FROM'
    );

    expectPolicyDslError(
      () => parsePolicyDsl(`
POLICY ""
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "r"
PRIORITY 1
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5220" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "2000" AMOUNT EVENT_AMOUNT
`),
      'POLICY name must not be empty'
    );
  });
});
