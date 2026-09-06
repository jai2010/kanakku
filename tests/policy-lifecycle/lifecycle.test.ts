import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { PolicyLifecycleError } from '../../src/domain/policies/PolicyLifecycle';
import { PolicyVersionStatus } from '../../src/domain/policies/PolicyVersion';
import {
  CASH_ID,
  createLifecycleHarness,
  policyVersion,
  purchaseEvent,
  purchaseRule,
  TENANT_ID
} from './fixtures';

describe('Policy lifecycle transitions', () => {
  it('advances DRAFT → VALIDATED → SIMULATED → APPROVED → ACTIVE → RETIRED', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({ status: 'DRAFT' });

    const validated = await lifecycle.validate(draft, TENANT_ID);
    expect(validated.validation.valid).toBe(true);
    expect(validated.policyVersion.status).toBe('VALIDATED');

    const simulation = await lifecycle.simulate(validated.policyVersion, [
      purchaseEvent(id('lifecycle-sim-1'))
    ]);
    expect(simulation.events[0]?.wouldPost).toBe(true);

    const simulated = await lifecycle.completeSimulation(
      validated.policyVersion,
      simulation,
      TENANT_ID
    );
    expect(simulated.status).toBe('SIMULATED');

    const approved = await lifecycle.approve(simulated, TENANT_ID);
    expect(approved.status).toBe('APPROVED');

    const active = await lifecycle.activate(approved, TENANT_ID);
    expect(active.status).toBe('ACTIVE');

    const retired = await lifecycle.retire(active, TENANT_ID);
    expect(retired.status).toBe('RETIRED');
  });

  it('advances AI_GENERATED → VALIDATED', async () => {
    const { lifecycle } = createLifecycleHarness();
    const authored = policyVersion({ status: 'AI_GENERATED' });
    const validated = await lifecycle.validate(authored, TENANT_ID);
    expect(validated.validation.valid).toBe(true);
    expect(validated.policyVersion.status).toBe('VALIDATED');
  });

  it('does not change status when validation fails', async () => {
    const { lifecycle } = createLifecycleHarness();
    const draft = policyVersion({
      status: 'DRAFT',
      rules: [
        purchaseRule(id('lifecycle-dup-a'), CASH_ID, 50),
        purchaseRule(id('lifecycle-dup-b'), CASH_ID, 50)
      ]
    });
    const result = await lifecycle.validate(draft, TENANT_ID);
    expect(result.validation.valid).toBe(false);
    expect(result.policyVersion.status).toBe('DRAFT');
  });

  it('rejects invalid transitions', async () => {
    const { lifecycle } = createLifecycleHarness();
    const cases: Array<{ status: PolicyVersionStatus; run: () => Promise<unknown> }> = [
      {
        status: 'DRAFT',
        run: () => lifecycle.activate(policyVersion({ status: 'DRAFT' }), TENANT_ID)
      },
      {
        status: 'VALIDATED',
        run: () => lifecycle.activate(policyVersion({ status: 'VALIDATED' }), TENANT_ID)
      },
      {
        status: 'SIMULATED',
        run: () => lifecycle.activate(policyVersion({ status: 'SIMULATED' }), TENANT_ID)
      },
      {
        status: 'ACTIVE',
        run: () => lifecycle.approve(policyVersion({ status: 'ACTIVE' }), TENANT_ID)
      },
      {
        status: 'RETIRED',
        run: () => lifecycle.activate(policyVersion({ status: 'RETIRED' }), TENANT_ID)
      },
      {
        status: 'APPROVED',
        run: () => lifecycle.retire(policyVersion({ status: 'APPROVED' }), TENANT_ID)
      }
    ];

    for (const testCase of cases) {
      await expect(testCase.run()).rejects.toBeInstanceOf(PolicyLifecycleError);
    }
  });

  it('keeps evaluate() closed to non-ACTIVE lifecycle states', () => {
    const engine = new PolicyEngineService();
    const event = purchaseEvent(id('lifecycle-eval-event'));
    for (const status of ['DRAFT', 'AI_GENERATED', 'VALIDATED', 'SIMULATED', 'APPROVED', 'RETIRED'] as const) {
      const result = engine.evaluate(event, policyVersion({ status }));
      expect(result.reason).toBe('POLICY_NOT_ACTIVE');
      expect(result.matched).toBe(false);
    }
  });
});
