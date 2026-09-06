import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { createAccount } from '../../src/domain/accounting/Account';
import {
  CASH_ID,
  createLifecycleHarness,
  EXPENSE_ID,
  OTHER_TENANT_ID,
  policyVersion,
  purchaseRule,
  TENANT_ID,
  twoLineTreatment
} from './fixtures';

describe('Policy validation boundary', () => {
  it('rejects malformed PolicyIR', async () => {
    const { lifecycle, accounts } = createLifecycleHarness();
    const engine = new PolicyEngineService();
    const result = await engine.validate({
      id: id('lifecycle-bad-ir'),
      policyId: id('lifecycle-policy'),
      tenantId: TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'DRAFT',
      createdAt: new Date(),
      definition: { rules: [] }
    }, {
      tenantId: TENANT_ID,
      getAccount: (accountId) => accounts.getAccount(accountId)
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'POLICY_IR_INVALID')).toBe(true);
    expect(lifecycle).toBeDefined();
  });

  it('rejects invalid account references', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({
      rules: [purchaseRule(id('lifecycle-missing-acc'), id('lifecycle-no-such-account'))]
    });
    const result = await lifecycle.validate(draft, TENANT_ID);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.code === 'INVALID_ACCOUNT')).toBe(true);
  });

  it('rejects invalid amount expressions', async () => {
    const { accounts } = createLifecycleHarness();
    const engine = new PolicyEngineService();
    const result = await engine.validate({
      id: id('lifecycle-bad-amount'),
      policyId: id('lifecycle-policy'),
      tenantId: TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'DRAFT',
      createdAt: new Date(),
      definition: {
        rules: [{
          id: id('lifecycle-amount-rule'),
          priority: 1,
          when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          then: {
            treatment: {
              lines: [
                { accountId: EXPENSE_ID, side: 'DEBIT', amount: { type: 'FIXED_AMOUNT' } },
                { accountId: CASH_ID, side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
              ]
            }
          }
        }]
      }
    }, {
      tenantId: TENANT_ID,
      getAccount: (accountId) => accounts.getAccount(accountId)
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'POLICY_IR_INVALID')).toBe(true);
  });

  it('rejects conflicting rules that share a priority', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({
      rules: [
        purchaseRule(id('lifecycle-c1'), CASH_ID, 10),
        purchaseRule(id('lifecycle-c2'), CASH_ID, 10)
      ]
    });
    const result = await lifecycle.validate(draft, TENANT_ID);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.code === 'CONFLICTING_RULES')).toBe(true);
  });

  it('rejects one-sided treatments', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({
      rules: [{
        id: id('lifecycle-onesided'),
        priority: 1,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: {
          treatment: {
            lines: [
              { accountId: EXPENSE_ID, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
              { accountId: CASH_ID, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } }
            ]
          }
        }
      }]
    });
    const result = await lifecycle.validate(draft, TENANT_ID);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.code === 'ONE_SIDED_TREATMENT')).toBe(true);
  });

  it('rejects tenant mismatch on the policy and on accounts', async () => {
    const { lifecycle, accounts } = createLifecycleHarness();
    const otherAccount = createAccount({
      id: id('lifecycle-foreign-acc'),
      tenantId: OTHER_TENANT_ID,
      code: '9999',
      name: 'Foreign',
      type: 'ASSET',
      status: 'ACTIVE'
    });
    accounts.add(otherAccount);

    const wrongTenant = await lifecycle.validate(
      policyVersion({ tenantId: OTHER_TENANT_ID }),
      TENANT_ID
    );
    expect(wrongTenant.validation.issues.some((issue) => issue.code === 'TENANT_MISMATCH')).toBe(true);

    const foreignAccount = await lifecycle.validate(policyVersion({
      rules: [{
        id: id('lifecycle-foreign-rule'),
        priority: 1,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment(EXPENSE_ID, otherAccount.id) }
      }]
    }), TENANT_ID);
    expect(foreignAccount.validation.issues.some((issue) => issue.code === 'TENANT_MISMATCH')).toBe(true);
  });

  it('rejects invalid effective dates', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({
      effectiveFrom: new Date('2026-06-01'),
      effectiveTo: new Date('2026-01-01')
    });
    const result = await lifecycle.validate(draft, TENANT_ID);
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.some((issue) => issue.code === 'INVALID_EFFECTIVE_DATES')).toBe(true);
  });

  it('has no ledger side effects', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    await lifecycle.validate(policyVersion({ status: 'DRAFT' }), TENANT_ID);
    expect(journals.postedSaves).toBe(0);
    expect(await journals.findByTenantId(TENANT_ID)).toEqual([]);
  });
});
