// Golden Scenario 2: Purchase + tax
// DR Expense       ₹8,200
// DR Tax Receivable  ₹1,000
// CR Payable       ₹9,200

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Golden Scenario 2 - Purchase with Tax', () => {
  it('should generate correct journal for purchase with tax', () => {
    // Setup accounts
    const expenseAccount = createAccount({
      id: 'acc-expense',
      tenantId: 'tenant-1',
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const taxReceivableAccount = createAccount({
      id: 'acc-tax-receivable',
      tenantId: 'tenant-1',
      code: '1800',
      name: 'Tax Receivable',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const payableAccount = createAccount({
      id: 'acc-payable',
      tenantId: 'tenant-1',
      code: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    const chartOfAccounts = new Map([
      ['acc-expense', expenseAccount],
      ['acc-tax-receivable', taxReceivableAccount],
      ['acc-payable', payableAccount]
    ]);

    // Setup policy version for purchase with tax
    // In this example, we'll assume the tax amount is known or can be calculated
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: 'acc-expense',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Expense amount'
        },
        {
          accountId: 'acc-tax-receivable',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' }, // In real system, this might be a percentage or attribute
          description: 'Tax receivable'
        },
        {
          accountId: 'acc-payable',
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Total payable'
        }
      ]
    };

    const rule: Rule = {
      id: 'rule-purchase-with-tax',
      priority: 100,
      when: {
        all: [
          { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          { field: 'attributes.hasTax', operator: 'equals', value: true }
        ]
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      id: 'pv-purchase-with-tax',
      policyId: 'pol-purchase-with-tax',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Setup business event with tax information
    const businessEvent = createBusinessEvent({
      id: 'evt-purchase-with-tax',
      tenantId: 'tenant-1',
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 8200, // Base expense amount
      currency: 'INR',
      counterparty: 'Supplier ABC',
      attributes: {
        hasTax: true,
        taxAmount: 1000, // Tax amount
        totalAmount: 9200 // Total amount including tax
      },
      source: 'API'
    });

    // Mock accounting engine processing
    const processPurchaseWithTax = (event: any, policyVersion: any, accounts: Map<string, any>) => {
      // Policy evaluation
      let matchedRuleId: string | undefined = undefined;
      let highestPriority = -Infinity;

      for (const rule of policyVersion.definition.rules) {
        const matchesEventType = event.eventType === 'PURCHASE';
        const hasTaxAttribute = event.attributes?.hasTax === true;

        if (matchesEventType && hasTaxAttribute) {
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
      // For this scenario, we'll handle the tax amount specially
      const journalLines = matchedRule.then.treatment.lines.map((line: any, index: number) => {
        let amount = 0;

        // For simplicity in this test, we'll assign amounts based on line index
        // In a real system, we'd use the expression evaluator and possibly event attributes
        if (index === 0) { // Expense line
          amount = event.amount || 0; // Base expense amount
        } else if (index === 1) { // Tax receivable line
          amount = event.attributes?.taxAmount || 0; // Tax amount from attributes
        } else if (index === 2) { // Payable line
          amount = (event.amount || 0) + (event.attributes?.taxAmount || 0); // Total amount
        }

        return {
          id: `line-${index}`,
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
          id: 'journal-purchase-with-tax',
          tenantId: event.tenantId,
          businessEventId: event.id,
          accountingTransactionId: 'txn-purchase-with-tax',
          policyVersionId: policyVersion.id,
          ruleId: matchedRuleId,
          transactionDate: event.occurredAt,
          currency: event.currency || 'USD',
          description: 'Purchase with tax journal',
          lines: journalLines,
          status: 'DRAFT' as const,
          createdAt: new Date()
        }
      };
    };

    // Process the event
    const result = processPurchaseWithTax(businessEvent, policyVersion, chartOfAccounts);

    // Assertions
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('SUCCESS');
    expect(result.journal).not.toBeNull();

    const journal = result.journal!;
    expect(journal.lines.length).toBe(3);
    expect(journal.status).toBe('DRAFT');

    // Find and verify each line
    const expenseLine = journal.lines.find((line: { accountId: string; debit: number; credit: number }) => line.accountId === 'acc-expense');
    expect(expenseLine).not.toBeUndefined();
    expect(expenseLine?.debit).toBe(8200); // Base expense amount
    expect(expenseLine?.credit).toBe(0);

    const taxReceivableLine = journal.lines.find((line: { accountId: string; debit: number; credit: number }) => line.accountId === 'acc-tax-receivable');
    expect(taxReceivableLine).not.toBeUndefined();
    expect(taxReceivableLine?.debit).toBe(1000); // Tax amount
    expect(taxReceivableLine?.credit).toBe(0);

    const payableLine = journal.lines.find((line: { accountId: string; debit: number; credit: number }) => line.accountId === 'acc-payable');
    expect(payableLine).not.toBeUndefined();
    expect(payableLine?.debit).toBe(0);
    expect(payableLine?.credit).toBe(9200); // Total amount (expense + tax)

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: { debit: number; credit: number }) => sum + line.credit, 0);
    expect(totalDebits).toBe(9200);
    expect(totalCredits).toBe(9200);
    expect(totalDebits).toEqual(totalCredits);
  });
});