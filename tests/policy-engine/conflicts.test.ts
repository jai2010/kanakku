import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { PolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { BusinessEvent } from '../../src/domain/events/BusinessEvent';
import { Rule } from '../../src/domain/policies/PolicyIR';

describe('Policy Engine - Conflict Detection (Production)', () => {
  let policyEngine: PolicyEngineService;
  let accountingEngine: AccountingEngineService;

  beforeEach(() => {
    policyEngine = new PolicyEngineService();
    accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository: new InMemoryAccountRepository(),
        journalRepository: new InMemoryJournalRepository()
      }
    });
  });

  function purchaseEvent(): BusinessEvent {
    return createBusinessEvent({
      id: id('evt-conflict'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });
  }

  function twoLineTreatment(debitAccountId: string, creditAccountId: string) {
    return {
      lines: [
        { accountId: id(debitAccountId), side: 'DEBIT' as const, amount: { type: 'EVENT_AMOUNT' as const } },
        { accountId: id(creditAccountId), side: 'CREDIT' as const, amount: { type: 'EVENT_AMOUNT' as const } }
      ]
    };
  }

  function policyWithRules(policyVersionId: string, rules: Rule[]): PolicyVersion {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id(policyVersionId),
      policyId: id('pol-conflict'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: { rules }
    });
  }

  it('detects conflicting matched rules at the same priority', () => {
    const event = purchaseEvent();
    const policyVersion = policyWithRules('pv-same-priority', [
      {
        id: id('rule-a'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment('acc-1', 'acc-2') }
      },
      {
        id: id('rule-b'),
        priority: 100,
        when: { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
        then: { treatment: twoLineTreatment('acc-3', 'acc-4') }
      }
    ]);

    const result = policyEngine.evaluate(event, policyVersion);

    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBeNull();
    expect(result.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(result.matchedRuleIds).toEqual([id('rule-a'), id('rule-b')]);
  });

  it('does not flag same-priority rules as a conflict when only one matches', () => {
    const event = purchaseEvent();
    const policyVersion = policyWithRules('pv-same-priority-one-match', [
      {
        id: id('rule-purchase'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment('acc-1', 'acc-2') }
      },
      {
        id: id('rule-refund'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'REFUND' },
        then: { treatment: twoLineTreatment('acc-3', 'acc-4') }
      }
    ]);

    const result = policyEngine.evaluate(event, policyVersion);

    expect(result.matched).toBe(true);
    expect(result.reason).toBe('MATCHED_RULE');
    expect(result.selectedRuleId).toBe(id('rule-purchase'));
    expect(result.matchedRuleIds).toEqual([id('rule-purchase')]);
  });

  it('does not flag overlapping matched rules at different priorities as a conflict', () => {
    const event = purchaseEvent();
    const policyVersion = policyWithRules('pv-different-priority', [
      {
        id: id('rule-low'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment('acc-1', 'acc-2') }
      },
      {
        id: id('rule-high'),
        priority: 200,
        when: { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
        then: { treatment: twoLineTreatment('acc-3', 'acc-4') }
      }
    ]);

    const result = policyEngine.evaluate(event, policyVersion);

    expect(result.matched).toBe(true);
    expect(result.reason).toBe('MATCHED_RULE');
    expect(result.selectedRuleId).toBe(id('rule-high'));
    expect(result.matchedRuleIds).toEqual([id('rule-low'), id('rule-high')]);
  });

  it('detects conflict when overlapping AND conditions both match at the same priority', () => {
    const event = purchaseEvent();
    const policyVersion = policyWithRules('pv-overlapping-and', [
      {
        id: id('rule-a'),
        priority: 100,
        when: {
          AND: [
            { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            { field: 'counterparty', operator: 'equals', value: 'Starbucks' }
          ]
        },
        then: { treatment: twoLineTreatment('acc-1', 'acc-2') }
      },
      {
        id: id('rule-b'),
        priority: 100,
        when: {
          AND: [
            { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            { field: 'amount', operator: 'greater_than', value: 5000 }
          ]
        },
        then: { treatment: twoLineTreatment('acc-3', 'acc-4') }
      }
    ]);

    const result = policyEngine.evaluate(event, policyVersion);

    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBeNull();
    expect(result.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(result.matchedRuleIds).toEqual([id('rule-a'), id('rule-b')]);
  });

  it('propagates policy-engine conflict through the accounting evaluation boundary', async () => {
    const event = purchaseEvent();
    const policyVersion = policyWithRules('pv-propagated-conflict', [
      {
        id: id('rule-a'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment('acc-1', 'acc-2') }
      },
      {
        id: id('rule-b'),
        priority: 100,
        when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        then: { treatment: twoLineTreatment('acc-3', 'acc-4') }
      }
    ]);

    const policyResult = policyEngine.evaluate(event, policyVersion);
    expect(policyResult.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(policyResult.matched).toBe(true);
    expect(policyResult.selectedRuleId).toBeNull();

    const accountingResult = await accountingEngine.evaluateWithPolicyVersion(event, policyVersion);

    expect(accountingResult.matched).toBe(true);
    expect(accountingResult.reason).toBe('POLICY_INVALID_CONFLICTING_RULES');
    expect(accountingResult.reason).not.toBe('NO_MATCHING_RULE');
    expect(accountingResult.selectedRuleId).toBeUndefined();
    expect(accountingResult.matchedRuleIds).toEqual([id('rule-a'), id('rule-b')]);
    expect(accountingResult.policyVersionId).toBe(policyVersion.id);
  });
});
