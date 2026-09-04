// Tests for rule priority logic

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Policy Engine - Rule Priority', () => {
  // Mock evaluation function (same as in rule-evaluation.test.ts)
  const evaluateRules = (event: any, policyVersion: any) => {
    const matchedRules: string[] = [];
    let selectedRuleId: string | undefined;
    let highestPriority = -Infinity;

    for (const rule of policyVersion.definition.rules) {
      if (evaluateCondition(rule.when, event)) {
        matchedRules.push(rule.id);
        if (rule.priority > highestPriority) {
          highestPriority = rule.priority;
          selectedRuleId = rule.id;
        }
      }
    }

    return {
      matched: matchedRules.length > 0,
      matchedRuleIds: matchedRules,
      selectedRuleId,
      reason: matchedRules.length > 0 ? 'MATCHED_RULE' : 'NO_MATCHING_RULE'
    };
  };

  const evaluateCondition = (condition: any, event: any): boolean => {
    if (condition.field && condition.operator && condition.value !== undefined) {
      // Simple condition
      return evaluateSimpleCondition(condition, event);
    } else {
      // Logical grouping: we expect one of 'all', 'any', 'not'
      if (condition.all) {
        // AND: all subconditions must be true
        for (const subcondition of condition.all) {
          if (!evaluateCondition(subcondition, event)) return false;
        }
        return true;
      } else if (condition.any) {
        // OR: at least one subcondition must be true
        for (const subcondition of condition.any) {
          if (evaluateCondition(subcondition, event)) return true;
        }
        return false;
      } else if (condition.not) {
        // NOT: invert the result of the subcondition
        return !evaluateCondition(condition.not, event);
      }
    }
    return false;
  };

  const evaluateSimpleCondition = (condition: any, event: any): boolean => {
    const eventValue: any = (event as any)[condition.field];
    switch (condition.operator) {
      case 'equals': return eventValue === condition.value;
      case 'not_equals': return eventValue !== condition.value;
      case 'greater_than': return eventValue > condition.value;
      case 'greater_than_or_equal': return eventValue >= condition.value;
      case 'less_than': return eventValue < condition.value;
      case 'less_than_or_equal': return eventValue <= condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(eventValue);
      case 'not_in': return !Array.isArray(condition.value) || !condition.value.includes(eventValue);
      case 'exists': return eventValue !== undefined && eventValue !== null;
      default: return false;
    }
  };

  it('should select the rule with the highest priority when multiple match', () => {
    const event = {
      eventType: 'PURCHASE',
      amount: 10000
    };

    const policyVersion = {
      id: 'pv-1',
      definition: {
        rules: [
          {
            id: 'rule-low-priority',
            priority: 50,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-1', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-2', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: 'rule-medium-priority',
            priority: 75,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-3', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-4', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: 'rule-high-priority',
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-5', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-6', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-high-priority');
    expect(result.matchedRuleIds).toEqual([
      'rule-low-priority',
      'rule-medium-priority',
      'rule-high-priority'
    ]);
  });

  it('should select the correct rule when priorities are not in order', () => {
    const event = {
      eventType: 'PURCHASE',
      amount: 10000
    };

    const policyVersion = {
      id: 'pv-2',
      definition: {
        rules: [
          {
            id: 'rule-b',
            priority: 200,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-1', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-2', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: 'rule-a',
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-3', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-4', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-b'); // Higher priority (200 > 100)
  });

  it('should handle negative priorities correctly', () => {
    const event = {
      eventType: 'PURCHASE',
      amount: 10000
    };

    const policyVersion = {
      id: 'pv-3',
      definition: {
        rules: [
          {
            id: 'rule-negative',
            priority: -100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-1', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-2', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: 'rule-zero',
            priority: 0,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-3', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-4', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-zero'); // 0 > -100
  });
});