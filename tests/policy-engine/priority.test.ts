import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Policy Engine - Rule Priority', () => {
  let policyEngine: PolicyEngineService;

  beforeEach(() => {
    policyEngine = new PolicyEngineService();
  });

  it('should select the rule with the highest priority when multiple match', () => {
    const event = createBusinessEvent({
      id: id('evt-highest-priority'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 10000,
      currency: 'USD',
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
            id: id('rule-low-priority'),
            priority: 50,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-2'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: id('rule-medium-priority'),
            priority: 75,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-3'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-4'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: id('rule-high-priority'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-5'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-6'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-high-priority'));
    expect(result.matchedRuleIds).toEqual([
      id('rule-low-priority'),
      id('rule-medium-priority'),
      id('rule-high-priority')
    ]);
  });

  it('should select the correct rule when priorities are not in order', () => {
    const event = createBusinessEvent({
      id: id('evt-unordered-priority'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 10000,
      currency: 'USD',
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
            id: id('rule-b'),
            priority: 200,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-2'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: id('rule-a'),
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-3'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-4'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-b')); // Higher priority (200 > 100)
  });

  it('should handle negative priorities correctly', () => {
    const event = createBusinessEvent({
      id: id('evt-negative-priority'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 10000,
      currency: 'USD',
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
            id: id('rule-negative'),
            priority: -100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-1'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-2'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: id('rule-zero'),
            priority: 0,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-3'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-4'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });

    const result = policyEngine.evaluate(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-zero')); // 0 > -100
  });
});
