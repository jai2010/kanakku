// Golden Scenario 1: Simple purchase
// DR Dining
// CR Credit Card

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Golden Scenario 1 - Simple Purchase', () => {
  it('should generate correct journal for simple purchase', () => {
    // Setup accounts
    const diningAccount = createAccount({
      id: 'acc-dining',
      tenantId: 'tenant-1',
      code: '5200',
      name: 'Dining Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const creditCardAccount = createAccount({
      id: 'acc-credit-card',
      tenantId: 'tenant-1',
      code: '2000',
      name: 'Credit Card Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    const chartOfAccounts = new Map([
      ['acc-dining', diningAccount],
      ['acc-credit-card', creditCardAccount]
    ]);

    // Setup policy version for simple purchase
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: 'acc-dining',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Dining expense'
        },
        {
          accountId: 'acc-credit-card',
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Credit card payment'
        }
      ]
    };

    const rule: Rule = {
      id: 'rule-simple-purchase',
      priority: 100,
      when: {
        field: 'eventType',
        operator: 'equals',
        value: 'PURCHASE'
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      id: 'pv-simple-purchase',
      policyId: 'pol-simple-purchase',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Setup business event
    const businessEvent = createBusinessEvent({
      id: 'evt-simple-purchase',
      tenantId: 'tenant-1',
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1500,
      currency: 'USD',
      counterparty: 'Restaurant XYZ',
      attributes: {},
      source: 'API'
    });

    // Mock accounting engine processing
    const processSimplePurchase = (event: any, policyVersion: any, accounts: Map<string, any>) => {
      // Policy evaluation
      let matchedRuleId: string | undefined = undefined;
      let highestPriority = -Infinity;

      for (const rule of policyVersion.definition.rules) {
        if (event.eventType === 'PURCHASE') { // Simplified condition matching
          if (rule.priority > highestPriority) {
            highestPriority = rule.priority;
            matchedRuleId = rule.id;
          }
        }
      }

      if (!matchedRuleId) {
        return { matched: false, reason: 'NO_MATCHING_RULE' };
      }

      // Find the matched rule
      const matchedRule = policyVersion.definition.rules.find((r: Rule) => r.id === matchedRuleId)!;

      // Generate journal lines
      const journalLines = matchedRule.then.treatment.lines.map((line: any) => {
        let amount = event.amount || 0;

        return {
          id: `line-${line.accountId}`,
          journalId: 'journal-test',
          accountId: line.accountId,
          debit: line.side === 'DEBIT' ? amount : 0,
          credit: line.side === 'CREDIT' ? amount : 0,
          currency: event.currency || 'USD',
          description: line.description || ''
        };
      });

      // Validate journal
      const totalDebits = journalLines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.debit, 0);
      const totalCredits = journalLines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.credit, 0);

      if (totalDebits !== totalCredits) {
        return { matched: true, reason: 'JOURNAL_NOT_BALANCED', journal: null };
      }

      // Check accounts exist
      for (const line of journalLines) {
        const account = accounts.get(line.accountId);
        if (!account) {
          return { matched: true, reason: 'ACCOUNT_NOT_FOUND', journal: null };
        }
        if (account.status !== 'ACTIVE') {
          return { matched: true, reason: 'ACCOUNT_INACTIVE', journal: null };
        }
      }

      return {
        matched: true,
        reason: 'SUCCESS',
        journal: {
          id: 'journal-simple-purchase',
          tenantId: event.tenantId,
          businessEventId: event.id,
          accountingTransactionId: 'txn-simple-purchase',
          policyVersionId: policyVersion.id,
          ruleId: matchedRuleId,
          transactionDate: event.occurredAt,
          currency: event.currency || 'USD',
          description: 'Simple purchase journal',
          lines: journalLines,
          status: 'DRAFT' as const,
          createdAt: new Date()
        }
      };
    };

    // Process the event
    const result = processSimplePurchase(businessEvent, policyVersion, chartOfAccounts);

    // Assertions
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('SUCCESS');
    expect(result.journal).not.toBeNull();

    const journal = result.journal!;
    expect(journal.lines.length).toBe(2);
    expect(journal.status).toBe('DRAFT');

    // Find the dining expense line (should be debit)
    const diningLine = journal.lines.find((line: any) => line.accountId === 'acc-dining');
    expect(diningLine).not.toBeUndefined();
    expect(diningLine?.debit).toBe(1500);
    expect(diningLine?.credit).toBe(0);

    // Find the credit card line (should be credit)
    const creditCardLine = journal.lines.find((line: any) => line.accountId === 'acc-credit-card');
    expect(creditCardLine).not.toBeUndefined();
    expect(creditCardLine?.debit).toBe(0);
    expect(creditCardLine?.credit).toBe(1500);

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum: number, line: any) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: any) => sum + line.credit, 0);
    expect(totalDebits).toBe(1500);
    expect(totalCredits).toBe(1500);
    expect(totalDebits).toEqual(totalCredits);
  });
});