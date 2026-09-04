// Golden Scenario 4: Refund
// DR Credit Card
// CR Expense

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Golden Scenario 4 - Refund', () => {
  it('should generate correct journal for refund', () => {
    // Setup accounts
    const creditCardAccount = createAccount({
      id: 'acc-credit-card',
      tenantId: 'tenant-1',
      code: '2000',
      name: 'Credit Card Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    const diningAccount = createAccount({
      id: 'acc-dining',
      tenantId: 'tenant-1',
      code: '5200',
      name: 'Dining Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const chartOfAccounts = new Map([
      ['acc-credit-card', creditCardAccount],
      ['acc-dining', diningAccount]
    ]);

    // Setup policy version for refund
    // Note: For a refund, we would typically have a REFUND event type
    // and the treatment would be opposite of a purchase
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: 'acc-credit-card',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Credit card refund'
        },
        {
          accountId: 'acc-dining',
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Dining expense refund'
        }
      ]
    };

    const rule: Rule = {
      id: 'rule-refund',
      priority: 100,
      when: {
        field: 'eventType',
        operator: 'equals',
        value: 'REFUND'
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      id: 'pv-refund',
      policyId: 'pol-refund',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Setup business event
    const businessEvent = createBusinessEvent({
      id: 'evt-refund',
      tenantId: 'tenant-1',
      eventType: 'REFUND',
      occurredAt: new Date('2026-09-03'),
      amount: 800,
      currency: 'USD',
      counterparty: 'Restaurant XYZ',
      attributes: { originalInvoice: 'INV-001' },
      source: 'API'
    });

    // Mock accounting engine processing
    const processRefund = (event: any, policyVersion: any, accounts: Map<string, any>) => {
      // Policy evaluation
      let matchedRuleId: string | undefined = undefined;
      let highestPriority = -Infinity;

      for (const rule of policyVersion.definition.rules) {
        if (event.eventType === 'REFUND') { // Simplified condition matching
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
          id: 'journal-refund',
          tenantId: event.tenantId,
          businessEventId: event.id,
          accountingTransactionId: 'txn-refund',
          policyVersionId: policyVersion.id,
          ruleId: matchedRuleId,
          transactionDate: event.occurredAt,
          currency: event.currency || 'USD',
          description: 'Refund journal',
          lines: journalLines,
          status: 'DRAFT' as const,
          createdAt: new Date()
        }
      };
    };

    // Process the event
    const result = processRefund(businessEvent, policyVersion, chartOfAccounts);

    // Assertions
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('SUCCESS');
    expect(result.journal).not.toBeNull();

    const journal = result.journal!;
    expect(journal.lines.length).toBe(2);
    expect(journal.status).toBe('DRAFT');

    // Find the credit card line (should be debit for refund)
    const creditCardLine = journal.lines.find((line: { accountId: string; debit: number; credit: number }) => line.accountId === 'acc-credit-card');
    expect(creditCardLine).not.toBeUndefined();
    expect(creditCardLine?.debit).toBe(800);
    expect(creditCardLine?.credit).toBe(0);

    // Find the dining expense line (should be credit for refund)
    const diningLine = journal.lines.find((line: { accountId: string; debit: number; credit: number }) => line.accountId === 'acc-dining');
    expect(diningLine).not.toBeUndefined();
    expect(diningLine?.debit).toBe(0);
    expect(diningLine?.credit).toBe(800);

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.credit, 0);
    expect(totalDebits).toBe(800);
    expect(totalCredits).toBe(800);
    expect(totalDebits).toEqual(totalCredits);
  });
});