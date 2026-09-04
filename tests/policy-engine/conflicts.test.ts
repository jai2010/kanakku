// Tests for policy conflict detection

describe('Policy Engine - Conflict Detection', () => {
  // In a real implementation, this would be part of policy validation
  const hasConflictingRules = (policyVersion: any) => {
    // Group rules by their conditions to detect conflicts
    // For simplicity, we'll check if two rules with same priority have overlapping conditions
    // A real implementation would be more sophisticated

    const rulesByPriority: Record<number, any[]> = {};

    for (const rule of policyVersion.definition.rules) {
      if (!rulesByPriority[rule.priority]) {
        rulesByPriority[rule.priority] = [];
      }
      rulesByPriority[rule.priority].push(rule);
    }

    // Check each priority level for potential conflicts
    for (const priority in rulesByPriority) {
      const rules = rulesByPriority[priority];
      if (rules.length > 1) {
        // In a real system, we'd do more sophisticated condition analysis
        // For this test, we'll flag any priority with multiple rules as potentially conflicting
        return true;
      }
    }

    return false;
  };

  it('should detect conflicting rules with same priority', () => {
    const policyVersion = {
      id: 'pv-1',
      definition: {
        rules: [
          {
            id: 'rule-a',
            priority: 100,
            when: {
              field: 'counterparty',
              operator: 'equals',
              value: 'Starbucks'
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
            id: 'rule-b',
            priority: 100, // Same priority as rule-a - potential conflict
            when: {
              field: 'counterparty',
              operator: 'equals',
              value: 'Starbucks'
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

    expect(hasConflictingRules(policyVersion)).toBe(true);
  });

  it('should not flag rules with different priorities as conflicting', () => {
    const policyVersion = {
      id: 'pv-2',
      definition: {
        rules: [
          {
            id: 'rule-a',
            priority: 100,
            when: {
              field: 'counterparty',
              operator: 'equals',
              value: 'Starbucks'
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
            id: 'rule-b',
            priority: 200, // Different priority
            when: {
              field: 'counterparty',
              operator: 'equals',
              value: 'Starbucks'
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

    expect(hasConflictingRules(policyVersion)).toBe(false);
  });

  it('should handle complex conditions in conflict detection (simplified)', () => {
    const policyVersion = {
      id: 'pv-3',
      definition: {
        rules: [
          {
            id: 'rule-a',
            priority: 100,
            when: {
              all: [
                { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
                { field: 'counterparty', operator: 'equals', value: 'Starbucks' }
              ]
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
            id: 'rule-b',
            priority: 100, // Same priority
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
                  { accountId: 'acc-3', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: 'acc-4', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    };

    expect(hasConflictingRules(policyVersion)).toBe(true);
  });
});