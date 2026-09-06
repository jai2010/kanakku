import { id } from '../fixtures/ids';
import { PolicyDslService } from '../../src/application/policies/PolicyDslService';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import {
  CASH_ID,
  createLifecycleHarness,
  EXPENSE_ID,
  PAYABLE_ID,
  policyVersion,
  purchaseEvent,
  purchaseRule,
  TENANT_ID
} from './fixtures';

describe('Policy simulation impact comparison', () => {
  it('makes V1 cash vs V2 payable behavior observable without posting either policy', async () => {
    const { lifecycle, journals } = createLifecycleHarness();
    const events = [
      purchaseEvent(id('impact-1'), 1200),
      purchaseEvent(id('impact-2'), 800)
    ];

    const v1 = policyVersion({
      id: id('impact-v1'),
      status: 'VALIDATED',
      version: 1,
      rules: [purchaseRule(id('impact-rule-v1'), CASH_ID)]
    });
    const v2 = policyVersion({
      id: id('impact-v2'),
      status: 'VALIDATED',
      version: 2,
      rules: [purchaseRule(id('impact-rule-v2'), PAYABLE_ID)]
    });

    const first = await lifecycle.simulate(v1, events);
    const second = await lifecycle.simulate(v2, events);

    expect(first.events.map((eventResult) => eventResult.journalPreview?.lines[1]?.accountId))
      .toEqual([CASH_ID, CASH_ID]);
    expect(second.events.map((eventResult) => eventResult.journalPreview?.lines[1]?.accountId))
      .toEqual([PAYABLE_ID, PAYABLE_ID]);
    expect(first.events[0]?.journalPreview?.lines[0]?.accountId).toBe(EXPENSE_ID);
    expect(second.events[0]?.journalPreview?.lines[0]?.accountId).toBe(EXPENSE_ID);
    expect(journals.postedSaves).toBe(0);
    expect(await journals.findByTenantId(TENANT_ID)).toEqual([]);
  });

  it('keeps the programmatic PolicyIR path working', async () => {
    const { accounts, journals } = createLifecycleHarness();
    const policies = new InMemoryPolicyVersionRepository();
    policies.add(createPolicyVersion({
      id: id('impact-programmatic-pv'),
      policyId: id('impact-programmatic-policy'),
      tenantId: TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [purchaseRule(id('impact-programmatic-rule'), CASH_ID)]
      }
    }));

    const result = await new AccountingService({
      policyVersionRepository: policies,
      accountRepository: accounts,
      journalRepository: journals
    }).processEvent(purchaseEvent(id('impact-programmatic-event')));

    expect(result.error).toBeUndefined();
    expect(result.postedJournal?.status).toBe('POSTED');
  });

  it('keeps the DSL path working through validate → simulate → approve → activate → POSTED', async () => {
    const { lifecycle, accounts, journals } = createLifecycleHarness();
    const dsl = new PolicyDslService();
    const compiled = dsl.compile(`
POLICY "Impact Meals"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "purchase"
PRIORITY 100
WHEN eventType = "PURCHASE"
THEN
DEBIT ACCOUNT "5000" AMOUNT EVENT_AMOUNT
CREDIT ACCOUNT "1000" AMOUNT EVENT_AMOUNT
`, {
      tenantId: TENANT_ID,
      accounts: new Map([
        ['5000', EXPENSE_ID],
        ['1000', CASH_ID]
      ]),
      status: 'DRAFT'
    });

    const validated = await lifecycle.validate(compiled, TENANT_ID);
    expect(validated.policyVersion.status).toBe('VALIDATED');
    const simulation = await lifecycle.simulate(validated.policyVersion, [
      purchaseEvent(id('impact-dsl-sim'))
    ]);
    const simulated = await lifecycle.completeSimulation(
      validated.policyVersion,
      simulation,
      TENANT_ID
    );
    const approved = await lifecycle.approve(simulated, TENANT_ID);
    const active = await lifecycle.activate(approved, TENANT_ID);

    const policies = new InMemoryPolicyVersionRepository();
    policies.add(active);
    const posted = await new AccountingService({
      policyVersionRepository: policies,
      accountRepository: accounts,
      journalRepository: journals
    }).processEvent(purchaseEvent(id('impact-dsl-exec'), 3300));

    expect(posted.error).toBeUndefined();
    expect(posted.postedJournal?.status).toBe('POSTED');
    expect(posted.journal?.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(3300);
    expect(posted.journal?.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(3300);
  });
});
