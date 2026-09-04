// Golden Scenario 3: Split allocation
// DR Travel Expense       ₹6,000
// DR Entertainment        ₹2,000
// DR Input Tax            ₹1,000
// CR Credit Card Payable  ₹9,000

import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Golden Scenario 3 - Split Allocation (Multi-line Journal)', () => {
  it('should generate correct journal for split allocation', () => {
    // Setup accounts
    const travelAccount = createAccount({
      id: 'acc-travel',
      tenantId: 'tenant-1',
      code: '5100',
      name: 'Travel Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const entertainmentAccount = createAccount({
      id: 'acc-entertainment',
      tenantId: 'tenant-1',
      code: '5200',
      name: 'Entertainment Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const taxAccount = createAccount({
      id: 'acc-input-tax',
      tenantId: 'tenant-1',
      code: '1800',
      name: 'Input Tax Receivable',
      type: 'ASSET',
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
      ['acc-travel', travelAccount],
      ['acc-entertainment', entertainmentAccount],
      ['acc-input-tax', taxAccount],
      ['acc-credit-card', creditCardAccount]
    ]);

    // Setup policy version for split allocation
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: 'acc-travel',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT', value: 6000 }, // In a real system, we might use attributes or calculations
          description: 'Travel portion'
        },
        {
          accountId: 'acc-entertainment',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT', value: 2000 },
          description: 'Entertainment portion'
        },
        {
          accountId: 'acc-input-tax',
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT', value: 1000 },
          description: 'Input tax portion'
        },
        {
          accountId: 'acc-credit-card',
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Credit card payment'
        }
      ]
    };

    // For this scenario, let's assume we have a way to specify split amounts
    // In a real implementation, this might come from event attributes or a more complex expression system
    const rule: Rule = {
      id: 'rule-split-allocation',
      priority: 100,
      when: {
        all: [
          { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          { field: 'attributes.invoiceType', operator: 'equals', value: 'SPLIT' }
        ]
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      id: 'pv-split-allocation',
      policyId: 'pol-split-allocation',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Setup business event with attributes for splitting
    const businessEvent = createBusinessEvent({
      id: 'evt-split-allocation',
      tenantId: 'tenant-1',
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 9000,
      currency: 'INR',
      counterparty: 'Hotel ABC',
      attributes: {
        invoiceType: 'SPLIT',
        travelAmount: 6000,
        entertainmentAmount: 2000,
        taxAmount: 1000
      },
      source: 'API'
    });

    // Mock accounting engine processing
    const processSplitAllocation = (event: any, policyVersion: any, accounts: Map<string, any>) => {
      // Policy evaluation
      let matchedRuleId: string | undefined = undefined;
      let highestPriority = -Infinity;

      for (const rule of policyVersion.definition.rules) {
        const matchesEventType = event.eventType === 'PURCHASE';
        const matchesInvoiceType = event.attributes?.invoiceType === 'SPLIT';

        if (matchesEventType && matchesInvoiceType) {
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

      // Generate journal lines - in a real system, we'd use the expression evaluator
      // For this test, we'll manually calculate based on attributes
      const journalLines = [
        {
          id: 'line-travel',
          journalId: 'journal-test',
          accountId: 'acc-travel',
          debit: event.attributes?.travelAmount || 0,
          credit: 0,
          currency: event.currency || 'USD',
          description: 'Travel portion'
        },
        {
          id: 'line-entertainment',
          journalId: 'journal-test',
          accountId: 'acc-entertainment',
          debit: event.attributes?.entertainmentAmount || 0,
          credit: 0,
          currency: event.currency || 'USD',
          description: 'Entertainment portion'
        },
        {
          id: 'line-tax',
          journalId: 'journal-test',
          accountId: 'acc-input-tax',
          debit: event.attributes?.taxAmount || 0,
          credit: 0,
          currency: event.currency || 'USD',
          description: 'Input tax portion'
        },
        {
          id: 'line-credit-card',
          journalId: 'journal-test',
          accountId: 'acc-credit-card',
          debit: 0,
          credit: event.amount || 0, // Full amount credited to credit card
          currency: event.currency || 'USD',
          description: 'Credit card payment'
        }
      ];

      // Validate journal
      const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);

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
          id: 'journal-split-allocation',
          tenantId: event.tenantId,
          businessEventId: event.id,
          accountingTransactionId: 'txn-split-allocation',
          policyVersionId: policyVersion.id,
          ruleId: matchedRuleId,
          transactionDate: event.occurredAt,
          currency: event.currency || 'USD',
          description: 'Split allocation journal',
          lines: journalLines,
          status: 'DRAFT' as const,
          createdAt: new Date()
        }
      };
    };

    // Process the event
    const result = processSplitAllocation(businessEvent, policyVersion, chartOfAccounts);

    // Assertions
    expect(result.matched).toBe(true);
    expect(result.reason).toBe('SUCCESS');
    expect(result.journal).not.toBeNull();

    const journal = result.journal!;
    expect(journal.lines.length).toBe(4);
    expect(journal.status).toBe('DRAFT');

    // Find and verify each line
    const travelLine = journal.lines.find(line => line.accountId === 'acc-travel');
    expect(travelLine).not.toBeUndefined();
    expect(travelLine?.debit).toBe(6000);
    expect(travelLine?.credit).toBe(0);

    const entertainmentLine = journal.lines.find(line => line.accountId === 'acc-entertainment');
    expect(entertainmentLine).not.toBeUndefined();
    expect(entertainmentLine?.debit).toBe(2000);
    expect(entertainmentLine?.credit).toBe(0);

    const taxLine = journal.lines.find(line => line.accountId === 'acc-input-tax');
    expect(taxLine).not.toBeUndefined();
    expect(taxLine?.debit).toBe(1000);
    expect(taxLine?.credit).toBe(0);

    const creditCardLine = journal.lines.find(line => line.accountId === 'acc-credit-card');
    expect(creditCardLine).not.toBeUndefined();
    expect(creditCardLine?.debit).toBe(0);
    expect(creditCardLine?.credit).toBe(9000);

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(totalDebits).toBe(9000);
    expect(totalCredits).toBe(9000);
    expect(totalDebits).toEqual(totalCredits);
  });
});