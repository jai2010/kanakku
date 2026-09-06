import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Policy Engine - Rule Evaluation', () => {
  let policyEngine: PolicyEngineService;

  beforeEach(() => {
    policyEngine = new PolicyEngineService();
  });

  it('should evaluate a simple equals condition', () => {
    const event = createBusinessEvent({
      id: id('evt-simple-equals'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-1'),
      policyId: id('pol-1'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-1'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-2'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-1'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-1'));
    expect(result.matchedRuleIds).toEqual([id('rule-1')]);
  });

  it('should evaluate a complex condition with AND', () => {
    const event = createBusinessEvent({
      id: id('evt-and-condition'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-2'),
      policyId: id('pol-2'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-1'),
            priority: 100,
            when: {
              AND: [
                { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
                { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
                { field: 'amount', operator: 'greater_than', value: 5000 }
              ]
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-2'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-3'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-1'));
  });

  it('should select the highest priority rule when multiple match', () => {
    const event = createBusinessEvent({
      id: id('evt-priority'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-3'),
      policyId: id('pol-3'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-low'),
            priority: 50,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-2'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-1'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: id('rule-high'),
            priority: 100,
            when: {
              AND: [
                { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
                { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
                { field: 'amount', operator: 'greater_than', value: 5000 }
              ]
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-2'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-3'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-high')); // Higher priority wins
    expect(result.matchedRuleIds).toEqual([id('rule-low'), id('rule-high')]);
  });

  it('should not match when no rules apply', () => {
    const event = createBusinessEvent({
      id: id('evt-no-match'),
      tenantId: id('tenant-1'),
      eventType: 'PAYMENT',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-4'),
      policyId: id('pol-4'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-1'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-2'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-1'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(false);
    expect(result.selectedRuleId).toBeNull();
    expect(result.matchedRuleIds).toEqual([]);
  });
});
