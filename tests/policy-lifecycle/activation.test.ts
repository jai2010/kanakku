import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { PolicyLifecycleError } from '../../src/domain/policies/PolicyLifecycle';
import {
  CASH_ID,
  createLifecycleHarness,
  OTHER_TENANT_ID,
  policyVersion,
  purchaseEvent,
  purchaseRule,
  TENANT_ID
} from './fixtures';

describe('Policy approval and activation', () => {
  it('cannot activate an unvalidated policy', async () => {
    const { lifecycle } = createLifecycleHarness();
    await expect(lifecycle.activate(policyVersion({ status: 'DRAFT' }), TENANT_ID))
      .rejects.toBeInstanceOf(PolicyLifecycleError);
  });

  it('cannot activate an unapproved policy', async () => {
    const { lifecycle } = createLifecycleHarness();
    await expect(lifecycle.activate(policyVersion({ status: 'VALIDATED' }), TENANT_ID))
      .rejects.toBeInstanceOf(PolicyLifecycleError);
    await expect(lifecycle.activate(policyVersion({ status: 'SIMULATED' }), TENANT_ID))
      .rejects.toBeInstanceOf(PolicyLifecycleError);
  });

  it('cannot activate a conflicting policy', async () => {
    const { lifecycle } = createLifecycleHarness();
    const approved = policyVersion({
      status: 'APPROVED',
      rules: [
        purchaseRule(id('act-conflict-a'), CASH_ID, 1),
        purchaseRule(id('act-conflict-b'), CASH_ID, 1)
      ]
    });
    await expect(lifecycle.activate(approved, TENANT_ID)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    });
  });

  it('cannot approve or activate across tenants', async () => {
    const { lifecycle } = createLifecycleHarness();
    const simulated = policyVersion({ status: 'SIMULATED' });
    await expect(lifecycle.approve(simulated, OTHER_TENANT_ID)).rejects.toMatchObject({
      code: 'TENANT_MISMATCH'
    });
    await expect(
      lifecycle.activate(policyVersion({ status: 'APPROVED' }), OTHER_TENANT_ID)
    ).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('approval does not activate, and neither posts journals', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const approved = await lifecycle.approve(policyVersion({ status: 'SIMULATED' }), TENANT_ID);
    expect(approved.status).toBe('APPROVED');
    expect(approved.status).not.toBe('ACTIVE');
    expect(journals.postedSaves).toBe(0);
  });

  it('activated policy is selected by tenant + occurredAt + ACTIVE + highest version', async () => {
    const { lifecycle, accounts, journals } = createLifecycleHarness();
    const policies = new InMemoryPolicyVersionRepository();
    const v1 = await lifecycle.activate(policyVersion({
      id: id('act-v1'),
      status: 'APPROVED',
      version: 1
    }), TENANT_ID);
    const v2 = await lifecycle.activate(policyVersion({
      id: id('act-v2'),
      status: 'APPROVED',
      version: 2
    }), TENANT_ID);
    policies.add(v1);
    policies.add(v2);
    policies.add(policyVersion({
      id: id('act-simulated'),
      status: 'SIMULATED',
      version: 9
    }));

    const selected = await policies.getActivePolicyVersion(TENANT_ID, new Date('2026-09-03'));
    expect(selected?.id).toBe(id('act-v2'));

    const service = new AccountingService({
      policyVersionRepository: policies,
      accountRepository: accounts,
      journalRepository: journals
    });
    const posted = await service.processEvent(purchaseEvent(id('act-exec')));
    expect(posted.error).toBeUndefined();
    expect(posted.postedJournal?.status).toBe('POSTED');
    expect(posted.evaluation.policyVersionId).toBe(id('act-v2'));
  });

  it('does not execute a policy outside its effective window after activation', async () => {
    const engine = new PolicyEngineService();
    const active = policyVersion({
      status: 'ACTIVE',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-06-30')
    });
    const inside = engine.evaluate({
      ...purchaseEvent(id('act-inside')),
      occurredAt: new Date('2026-03-15')
    }, active);
    const outside = engine.evaluate({
      ...purchaseEvent(id('act-outside')),
      occurredAt: new Date('2026-12-01')
    }, active);
    expect(inside.reason).toBe('MATCHED_RULE');
    expect(outside.reason).toBe('NO_MATCHING_RULE');
  });
});
