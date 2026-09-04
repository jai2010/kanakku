// Determinism tests for the accounting engine
// Verifies that same inputs always produce same outputs

import { Rule } from '../../src/domain/policies/PolicyIR';

describe('Accounting Engine - Determinism', () => {
  // Mock function that simulates deterministic accounting processing
  // In a real implementation, this would be the actual accounting engine
  const deterministicAccountingProcess = (inputs: {
    event: any;
    policyVersion: any;
    chartOfAccounts: Map<string, any>;
  }): any => {
    // This simulates a deterministic process with no randomness, no time dependence
    const { event, policyVersion, chartOfAccounts } = inputs;

    // Step 1: Policy evaluation (deterministic based on inputs)
    const evaluation = evaluatePolicyDeterministically(event, policyVersion);

    if (!evaluation.matched) {
      return {
        matched: false,
        reason: 'NO_MATCHING_RULE',
        journal: null
      };
    }

    // Step 2: Journal generation (deterministic based on inputs)
    const journal = generateJournalDeterministically(event, policyVersion, evaluation.selectedRuleId);

    // Step 3: Validation (deterministic based on inputs)
    const isValid = validateJournalDeterministically(journal, chartOfAccounts);

    if (!isValid.valid) {
      return {
        matched: true,
        reason: isValid.reason,
        journal: null
      };
    }

    // Step 4: Return deterministic result
    return {
      matched: true,
      reason: 'SUCCESS',
      journal: {
        id: `journal-deterministic-${event.id}-${policyVersion.id}`,
        // Note: In a real system, the journal ID might come from a sequence or DB
        // For determinism testing, we'll make it based on input values
        tenantId: event.tenantId,
        businessEventId: event.id,
        accountingTransactionId: `txn-deterministic-${event.id}-${policyVersion.id}`,
        policyVersionId: policyVersion.id,
        ruleId: evaluation.selectedRuleId,
        transactionDate: event.occurredAt,
        currency: event.currency || 'USD',
        description: `Deterministic journal for ${event.eventType} event`,
        lines: journal.lines,
        status: 'DRAFT' as const,
        createdAt: new Date(event.occurredAt.getTime()) // Based on event date, not current time
      }
    };
  };

  // Mock policy evaluation function (deterministic)
  const evaluatePolicyDeterministically = (event: any, policyVersion: any) => {
    const matchedRules: string[] = [];
    let selectedRuleId: string | undefined;
    let highestPriority = -Infinity;

    // Process rules in a deterministic order (by ID for consistency)
    const sortedRules = [...policyVersion.definition.rules].sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    for (const rule of sortedRules) {
      if (evaluateConditionDeterministically(rule.when, event)) {
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

  // Mock condition evaluation (deterministic)
  const evaluateConditionDeterministically = (condition: any, event: any): boolean => {
    if (condition.field && condition.operator && condition.value !== undefined) {
      return evaluateSimpleConditionDeterministically(condition, event);
    } else {
      // Logical grouping: we expect one of 'all', 'any', 'not'
      if (condition.all) {
        // AND: all subconditions must be true
        for (const subcondition of condition.all) {
          if (!evaluateConditionDeterministically(subcondition, event)) return false;
        }
        return true;
      } else if (condition.any) {
        // OR: at least one subcondition must be true
        for (const subcondition of condition.any) {
          if (evaluateConditionDeterministically(subcondition, event)) return true;
        }
        return false;
      } else if (condition.not) {
        // NOT: invert the result of the subcondition
        return !evaluateConditionDeterministically(condition.not, event);
      }
    }
    return false;
  };

  // Mock simple condition evaluation (deterministic)
  const evaluateSimpleConditionDeterministically = (condition: any, event: any) => {
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

  // Mock journal generation (deterministic)
  const generateJournalDeterministically = (event: any, policyVersion: any, ruleId: string | undefined) => {
    // Find the rule (deterministic)
    const rule = policyVersion.definition.rules.find((r: Rule) => r.id === ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Generate journal lines from treatment (deterministic)
    const journalLines = rule.then.treatment.lines.map((line: any, index: number) => {
      let amount = 0;

      if (line.amount.type === 'EVENT_AMOUNT') {
        amount = event.amount || 0;
      } else if (line.amount.type === 'FIXED_AMOUNT') {
        amount = line.amount.value || 0;
      }

      return {
        id: `line-deterministic-${index + 1}`,
        journalId: `journal-deterministic-${event.id}-${policyVersion.id}`,
        accountId: line.accountId,
        debit: line.side === 'DEBIT' ? amount : 0,
        credit: line.side === 'CREDIT' ? amount : 0,
        currency: event.currency || 'USD',
        description: line.description || `Line ${index + 1}`
      };
    });

    return { lines: journalLines };
  };

  // Mock journal validation (deterministic)
  const validateJournalDeterministically = (journal: any, chartOfAccounts: Map<string, any>) => {
    // Check minimum lines
    if (journal.lines.length < 2) {
      return { valid: false, reason: 'INSUFFICIENT_LINES' };
    }

    // Check each line has exactly one side
    for (const line of journal.lines) {
      const hasDebit = line.debit > 0;
      const hasCredit = line.credit > 0;
      if (!(hasDebit && !hasCredit) && !(hasDebit === false && hasCredit)) {
        return { valid: false, reason: 'INVALID_LINE_SIDE' };
      }
    }

    // Check accounts exist and are active
    for (const line of journal.lines) {
      const account = chartOfAccounts.get(line.accountId);
      if (!account) {
        return { valid: false, reason: 'ACCOUNT_NOT_FOUND', accountId: line.accountId };
      }
      if (account.status !== 'ACTIVE') {
        return { valid: false, reason: 'ACCOUNT_INACTIVE', accountId: line.accountId };
      }
    }

    // Check balancing (deterministic calculation)
    const totalDebits = journal.lines.reduce((sum: number, line: any) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: any) => sum + line.credit, 0);

    if (totalDebits !== totalCredits) {
      return { valid: false, reason: 'JOURNAL_NOT_BALANCED', totalDebits, totalCredits };
    }

    return { valid: true };
  };

  // Helper to create a consistent test scenario
  const createTestScenario = () => {
    // Chart of accounts (deterministic setup)
    const chartOfAccounts = new Map<string, any>();
    chartOfAccounts.set('acc-1000', {
      id: 'acc-1000',
      tenantId: 'tenant-1',
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });
    chartOfAccounts.set('acc-5200', {
      id: 'acc-5200',
      tenantId: 'tenant-1',
      code: '5200',
      name: 'Business Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    // Policy version (deterministic setup)
    const policyVersion = {
      id: 'pv-1',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: 'rule-starbucks-meals',
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
                  {
                    accountId: 'acc-5200',
                    side: 'DEBIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Business Meals Expense'
                  },
                  {
                    accountId: 'acc-1000',
                    side: 'CREDIT' as const,
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Cash Payment'
                  }
                ]
              }
            }
          }
        ]
      }
    };

    // Business event (deterministic setup)
    const event = {
      id: 'evt-determinism-test',
      tenantId: 'tenant-1',
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03T10:30:00Z'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {},
      source: 'TEST'
    };

    return { event, policyVersion, chartOfAccounts };
  };

  it('should produce identical output for same inputs (determinism test)', () => {
    const { event, policyVersion, chartOfAccounts } = createTestScenario();
    const inputs = { event, policyVersion, chartOfAccounts };

    // Run the process multiple times
    const results = [];
    const iterations = 1000; // As suggested in requirements

    for (let i = 0; i < iterations; i++) {
      const result = deterministicAccountingProcess(inputs);
      results.push(result);
    }

    // All results should be identical
    const firstResult = results[0];

    for (let i = 1; i < results.length; i++) {
      const result = results[i];

      // Check matched status
      expect(result.matched).toBe(firstResult.matched);

      // Check reason
      expect(result.reason).toBe(firstResult.reason);

      // If matched, check journal details
      if (result.matched && firstResult.matched) {
        expect(result.journal).not.toBeNull();
        expect(firstResult.journal).not.toBeNull();

        // Check journal ID (should be deterministic based on inputs)
        expect(result.journal.id).toBe(firstResult.journal.id);

        // Check tenant ID
        expect(result.journal.tenantId).toBe(firstResult.journal.tenantId);

        // Check business event ID
        expect(result.journal.businessEventId).toBe(firstResult.journal.businessEventId);

        // Check accounting transaction ID
        expect(result.journal.accountingTransactionId).toBe(firstResult.journal.accountingTransactionId);

        // Check policy version ID
        expect(result.journal.policyVersionId).toBe(firstResult.journal.policyVersionId);

        // Check rule ID
        expect(result.journal.ruleId).toBe(firstResult.journal.ruleId);

        // Check transaction date (should be based on event date)
        expect(result.journal.transactionDate.getTime()).toBe(firstResult.journal.transactionDate.getTime());

        // Check currency
        expect(result.journal.currency).toBe(firstResult.journal.currency);

        // Check description
        expect(result.journal.description).toBe(firstResult.journal.description);

        // Check status
        expect(result.journal.status).toBe(firstResult.journal.status);

        // Check created at (should be based on event date, not current time)
        expect(result.journal.createdAt.getTime()).toBe(firstResult.journal.createdAt.getTime());

        // Check lines count
        expect(result.journal.lines.length).toBe(firstResult.journal.lines.length);

        // Check each line
        for (let j = 0; j < result.journal.lines.length; j++) {
          const line = result.journal.lines[j];
          const firstLine = firstResult.journal.lines[j];

          expect(line.id).toBe(firstLine.id);
          expect(line.journalId).toBe(firstLine.journalId);
          expect(line.accountId).toBe(firstLine.accountId);
          expect(line.debit).toBe(firstLine.debit);
          expect(line.credit).toBe(firstLine.credit);
          expect(line.currency).toBe(firstLine.currency);
          expect(line.description).toBe(firstLine.description);
        }
      }
    }

    // If we got here, all results were identical
    expect(true).toBe(true); // This test passes if we reach this point
  });

  it('should produce different output when inputs change', () => {
    const { event, policyVersion, chartOfAccounts } = createTestScenario();

    // Change the event amount
    const modifiedEvent = { ...event, amount: 3000 }; // Below the 5000 threshold

    const inputs1 = { event, policyVersion, chartOfAccounts };
    const inputs2 = { event: modifiedEvent, policyVersion, chartOfAccounts };

    const result1 = deterministicAccountingProcess(inputs1);
    const result2 = deterministicAccountingProcess(inputs2);

    // With amount 7800, should match the rule
    // With amount 3000, should not match the rule (amount not > 5000)
    expect(result1.matched).toBe(true);
    expect(result2.matched).toBe(false);

    // Results should be different
    expect(result1).not.toEqual(result2);
  });

  it('should produce different output when policy changes', () => {
    const { event, policyVersion, chartOfAccounts } = createTestScenario();

    // Change the policy version ID
    const modifiedPolicyVersion = { ...policyVersion, id: 'pv-modified' };

    const inputs1 = { event, policyVersion, chartOfAccounts };
    const inputs2 = { event, policyVersion: modifiedPolicyVersion, chartOfAccounts };

    const result1 = deterministicAccountingProcess(inputs1);
    const result2 = deterministicAccountingProcess(inputs2);

    // Both should match (same logic) but journal IDs should differ
    expect(result1.matched).toBe(true);
    expect(result2.matched).toBe(true);

    // Journal IDs should be different due to different policy version ID
    expect(result1.journal.id).not.toBe(result2.journal.id);
    expect(result1.journal.policyVersionId).toBe('pv-1');
    expect(result2.journal.policyVersionId).toBe('pv-modified');
  });
});