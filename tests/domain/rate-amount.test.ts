import { id } from '../fixtures/ids';
import { resolveRateAmount } from '../../src/domain/accounting/resolveAttributeAmount';
import { compilePolicyDsl } from '../../src/domain/policies/dsl';

describe('RATE_AMOUNT', () => {
  it('rounds a fraction of the event amount and fails closed', () => {
    expect(resolveRateAmount(10000, 0.05)).toEqual({ kind: 'OK', amount: 500 });
    expect(resolveRateAmount(10000, 0.09)).toEqual({ kind: 'OK', amount: 900 });
    expect(resolveRateAmount(undefined, 0.05)).toEqual({ kind: 'INVALID' });
    expect(resolveRateAmount(10000, 0)).toEqual({ kind: 'INVALID' });
  });

  it('compiles RATE_AMOUNT journal lines in the policy DSL', () => {
    const dsl = `POLICY "Marketplace"
VERSION 1
EFFECTIVE FROM "2026-01-01"

RULE "Sale"
PRIORITY 125

WHEN
eventType = "MARKETPLACE_SALE"

THEN
DEBIT ACCOUNT "1010" AMOUNT EVENT_AMOUNT DESCRIPTION "Cash"
CREDIT ACCOUNT "2110" AMOUNT EVENT_AMOUNT DESCRIPTION "Seller Payable"
DEBIT ACCOUNT "2110" AMOUNT RATE_AMOUNT 0.05 DESCRIPTION "Fee"
CREDIT ACCOUNT "4110" AMOUNT RATE_AMOUNT 0.05 DESCRIPTION "Fee revenue"
`;
    const version = compilePolicyDsl(dsl, {
      tenantId: id('dsl-rate-tenant'),
      accounts: new Map([
        ['1010', id('acc-1010')],
        ['2110', id('acc-2110')],
        ['4110', id('acc-4110')]
      ]),
      status: 'DRAFT',
      createdAt: new Date(0)
    });
    const fee = version.definition.rules[0]?.then.treatment.lines.find((line) => line.description === 'Fee');
    expect(fee).toMatchObject({ side: 'DEBIT', amount: { type: 'RATE_AMOUNT', rate: 0.05 } });
  });
});
