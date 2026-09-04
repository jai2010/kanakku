// Mock policy engine for testing rule evaluation
// In a real implementation, this would import the actual policy engine

describe('Policy Engine - Rule Evaluation', () => {
  // We'll create mock data for testing
  const createMockAccount = (id: string, name: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') => ({
    id,
    name,
    type
  });

  const mockAccounts = new Map([
    ['acc-1', createMockAccount('acc-1', 'Cash', 'ASSET')],
    ['acc-2', createMockAccount('acc-2', 'Business Meals', 'EXPENSE')],
    ['acc-3', createMockAccount('acc-3', 'Credit Card', 'LIABILITY')]
  ]);

  // Simple rule evaluation function for testing
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

  const evaluateSimpleCondition = (condition: any, event: any) => {
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

  it('should evaluate a simple equals condition', () => {
    const event = {
      eventType: 'PURCHASE',
      counterparty: 'Starbucks',
      amount: 7800
    };

    const policyVersion = {
      id: 'pv-1',
      definition: {
        rules: [
          {
            id: 'rule-1',
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-2', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-1', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-1');
    expect(result.matchedRuleIds).toEqual(['rule-1']);
  });

  it('should evaluate a complex condition with AND', () => {
    const event = {
      eventType: 'PURCHASE',
      counterparty: 'Starbucks',
      amount: 7800
    };

    const policyVersion = {
      id: 'pv-2',
      definition: {
        rules: [
          {
            id: 'rule-1',
            priority: 100,
            when: {
              all: [
                { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
                { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
                { field: 'amount', operator: 'greater_than', value: 5000 }
              ]
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-2', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-3', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-1');
  });

  it('should select the highest priority rule when multiple match', () => {
    const event = {
      eventType: 'PURCHASE',
      counterparty: 'Starbucks',
      amount: 7800
    };

    const policyVersion = {
      id: 'pv-3',
      definition: {
        rules: [
          {
            id: 'rule-low',
            priority: 50,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-2', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-1', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          },
          {
            id: 'rule-high',
            priority: 100,
            when: {
              all: [
                { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
                { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
                { field: 'amount', operator: 'greater_than', value: 5000 }
              ]
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-2', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-3', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe('rule-high'); // Higher priority wins
    expect(result.matchedRuleIds).toEqual(['rule-low', 'rule-high']);
  });

  it('should not match when no rules apply', () => {
    const event = {
      eventType: 'SALE', // Different event type
      counterparty: 'Starbucks',
      amount: 7800
    };

    const policyVersion = {
      id: 'pv-4',
      definition: {
        rules: [
          {
            id: 'rule-1',
            priority: 100,
            when: {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            },
            then: {
              treatment: {
                lines: [
                  { accountId: 'acc-2', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-1', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    const result = evaluateRules(event, policyVersion);
    expect(result.matched).toBe(false);
    expect(result.selectedRuleId).toBeUndefined();
    expect(result.matchedRuleIds).toEqual([]);
  });
});