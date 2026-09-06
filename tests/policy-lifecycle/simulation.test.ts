import { id } from '../fixtures/ids';
import { PolicyLifecycleError } from '../../src/domain/policies/PolicyLifecycle';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import {
  CASH_ID,
  createLifecycleHarness,
  EXPENSE_ID,
  OTHER_TENANT_ID,
  PAYABLE_ID,
  policyVersion,
  purchaseEvent,
  purchaseRule,
  refundEvent,
  TENANT_ID
} from './fixtures';

describe('Policy simulation', () => {
  it('previews a matching event with balanced debit/credit lines and wouldPost', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const version = policyVersion({ status: 'VALIDATED' });
    const result = await lifecycle.simulate(version, [purchaseEvent(id('sim-match'), 2500)]);
    const eventResult = result.events[0];
    if (eventResult === undefined) {
      throw new Error('expected a simulation event result');
    }

    expect(eventResult.matched).toBe(true);
    expect(eventResult.reason).toBe('MATCHED_RULE');
    expect(eventResult.selectedRuleId).toBe(id('lifecycle-rule'));
    expect(eventResult.policyVersionId).toBe(version.id);
    expect(eventResult.wouldPost).toBe(true);
    expect(eventResult.journalPreview?.totalDebits).toBe(2500);
    expect(eventResult.journalPreview?.totalCredits).toBe(2500);
    expect(eventResult.journalPreview?.balanced).toBe(true);
    expect(eventResult.journalPreview?.lines).toEqual([
      expect.objectContaining({ accountId: EXPENSE_ID, debit: 2500, credit: 0 }),
      expect.objectContaining({ accountId: CASH_ID, debit: 0, credit: 2500 })
    ]);
    expect(journals.postedSaves).toBe(0);
  });

  it('reports no-match events without posting', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const result = await lifecycle.simulate(policyVersion({ status: 'VALIDATED' }), [
      refundEvent(id('sim-nomatch'))
    ]);
    expect(result.events[0]?.matched).toBe(false);
    expect(result.events[0]?.reason).toBe('NO_MATCHING_RULE');
    expect(result.events[0]?.wouldPost).toBe(false);
    expect(result.events[0]?.journalPreview).toBeUndefined();
    expect(journals.postedSaves).toBe(0);
  });

  it('reports conflicting rules and blocks completeSimulation', async () => {
    const { lifecycle } = createLifecycleHarness();
    const version = policyVersion({
      status: 'VALIDATED',
      rules: [
        purchaseRule(id('sim-conflict-a'), CASH_ID, 20),
        purchaseRule(id('sim-conflict-b'), PAYABLE_ID, 20)
      ]
    });
    const simulation = await lifecycle.simulate(version, [purchaseEvent(id('sim-conflict-evt'))]);
    expect(simulation.events[0]?.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(simulation.events[0]?.wouldPost).toBe(false);
    await expect(lifecycle.completeSimulation(version, simulation, TENANT_ID))
      .rejects.toBeInstanceOf(PolicyLifecycleError);
  });

  it('reports invalid treatment/journal generation failures', async () => {
    const { lifecycle } = createLifecycleHarness();
    const version = policyVersion({
      status: 'VALIDATED',
      rules: [purchaseRule(id('sim-missing-acc'), id('lifecycle-missing-preview-acc'))]
    });
    const simulation = await lifecycle.simulate(version, [purchaseEvent(id('sim-invalid-treatment'))]);
    expect(simulation.events[0]?.wouldPost).toBe(false);
    expect(simulation.events[0]?.reason).toBe('JOURNAL_GENERATION_FAILED');
  });

  it('simulates multiple events and a multi-line treatment', async () => {
    const { lifecycle } = createLifecycleHarness();
    const version = policyVersion({
      status: 'VALIDATED',
      rules: [{
        id: id('sim-multiline'),
        priority: 5,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: {
          treatment: {
            lines: [
              { accountId: EXPENSE_ID, side: 'DEBIT', amount: { type: 'FIXED_AMOUNT', value: 400, currency: 'USD' } },
              { accountId: PAYABLE_ID, side: 'DEBIT', amount: { type: 'FIXED_AMOUNT', value: 100, currency: 'USD' } },
              { accountId: CASH_ID, side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
            ]
          }
        }
      }]
    });

    const result = await lifecycle.simulate(version, [
      purchaseEvent(id('sim-multi-1'), 500),
      refundEvent(id('sim-multi-2'))
    ]);

    expect(result.events).toHaveLength(2);
    expect(result.events[0]?.wouldPost).toBe(true);
    expect(result.events[0]?.journalPreview?.lines).toHaveLength(3);
    expect(result.events[0]?.journalPreview?.totalDebits).toBe(500);
    expect(result.events[0]?.journalPreview?.totalCredits).toBe(500);
    expect(result.events[1]?.reason).toBe('NO_MATCHING_RULE');
  });

  it('does not persist journals, mutate ledger state, or call post()', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const version = policyVersion({ status: 'DRAFT' });

    await lifecycle.simulate(version, [
      purchaseEvent(id('sim-side-1')),
      purchaseEvent(id('sim-side-2'), 80),
      refundEvent(id('sim-side-3'))
    ]);

    expect(journals.postedSaves).toBe(0);
    expect(await journals.findByTenantId(TENANT_ID)).toEqual([]);
    expect(await journals.findByBusinessEventId(id('sim-side-1'), TENANT_ID)).toEqual([]);
  });

  it('does not change policy state', async () => {
    const { lifecycle } = createLifecycleHarness();
    const version = policyVersion({ status: 'VALIDATED' });
    await lifecycle.simulate(version, [purchaseEvent(id('sim-state'))]);
    expect(version.status).toBe('VALIDATED');
  });

  it('shares the same match path as evaluate() when requireActive is false', () => {
    const engine = new PolicyEngineService();
    const version = policyVersion({ status: 'VALIDATED' });
    const event = purchaseEvent(id('sim-shared-eval'));
    const production = engine.evaluate(event, version);
    const candidate = engine.evaluate(event, version, { requireActive: false });
    expect(production.reason).toBe('POLICY_NOT_ACTIVE');
    expect(candidate.reason).toBe('MATCHED_RULE');
    expect(candidate.selectedRuleId).toBe(id('lifecycle-rule'));
  });

  it('reports tenant mismatch without posting', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const version = policyVersion({ status: 'VALIDATED', tenantId: OTHER_TENANT_ID });
    const result = await lifecycle.simulate(version, [purchaseEvent(id('sim-tenant'))]);
    expect(result.events[0]?.reason).toBe('POLICY_NOT_FOUND');
    expect(journals.postedSaves).toBe(0);
  });
});
