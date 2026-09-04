import { AccountingEngine } from '../../domain/accounting/AccountingEngine';
import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { Journal } from '../../domain/accounting/Journal';
import { PostedJournal } from '../../domain/accounting/PostedJournal';
import { AccountingEvaluation } from '../../domain/accounting/AccountingEvaluation';
import { createAccount } from '../../domain/accounting/Account';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { PolicyIR } from '../../domain/policies/PolicyIR';
import { Rule } from '../../domain/policies/PolicyIR';
import { TreatmentLine } from '../../domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../domain/accounting/AccountingTreatment>;

// Mock implementation of the AccountingEngine for demonstration purposes
class MockAccountingEngine implements AccountingEngine {
  private accounts: Map<string, any> = new Map();
  private policyVersions: Map<string, any> = new Map();
  private journals: Map<string, any> = new Map();

  constructor() {
    // Set up some basic accounts for testing
    const cashAccount = createAccount({
      id: 'cash-account-id',
      tenantId: 'test-tenant-id',
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const revenueAccount = createAccount({
      id: 'revenue-account-id',
      tenantId: 'test-tenant-id',
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    });

    this.accounts.set(cashAccount.id, cashAccount);
    this.accounts.set(revenueAccount.id, revenueAccount);

    // Set up a simple policy version for testing
    const policyVersion: PolicyVersion = {
      id: 'policy-version-id',
      policyId: 'test-policy-id',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: 'rule-1',
            priority: 100,
            when: {
              all: [
                {
                  field: 'eventType',
                  operator: 'equals',
                  value: 'SALE'
                }
              ]
            },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: cashAccount.id,
                    side: 'DEBIT' as const,
                    amount: {
                      type: 'EVENT_AMOUNT'
                    }
                  },
                  {
                    accountId: revenueAccount.id,
                    side: 'CREDIT' as const,
                    amount: {
                      type: 'EVENT_AMOUNT'
                    }
                  }
                ]
              }
            }
          }
        ]
      },
      createdAt: new Date()
    };

    this.policyVersions.set(policyVersion.id, policyVersion);
  }

  async evaluate(event: BusinessEvent): Promise<AccountingEvaluation> {
    // Simple mock implementation - in reality this would evaluate rules
    if (event.eventType === 'SALE') {
      return {
        matched: true,
        policyVersionId: 'policy-version-id',
        matchedRuleIds: ['rule-1'],
        selectedRuleId: 'rule-1',
        reason: 'MATCHED_RULE'
      };
    }

    return {
      matched: false,
      policyVersionId: undefined,
      matchedRuleIds: [],
      selectedRuleId: undefined,
      reason: 'NO_MATCHING_RULE'
    };
  }

  async generateJournal(event: BusinessEvent): Promise<Journal> {
    // Simple mock implementation - in reality this would apply the treatment
    const journal: Journal = {
      id: 'journal-id',
      tenantId: event.tenantId,
      businessEventId: event.id,
      accountingTransactionId: 'transaction-id',
      policyVersionId: 'policy-version-id',
      ruleId: 'rule-1',
      transactionDate: event.occurredAt,
      currency: event.currency || 'USD',
      description: `Journal for ${event.eventType} event`,
      lines: [
        {
          id: 'journal-line-1',
          journalId: 'journal-id',
          accountId: 'cash-account-id',
          debit: event.amount || 0,
          credit: 0,
          currency: event.currency || 'USD',
          description: 'Cash received'
        },
        {
          id: 'journal-line-2',
          journalId: 'journal-id',
          accountId: 'revenue-account-id',
          debit: 0,
          credit: event.amount || 0,
          currency: event.currency || 'USD',
          description: 'Revenue recognized'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date()
    };

    return journal;
  }

  async post(journal: Journal): Promise<PostedJournal> {
    // Simple mock implementation
    const postedJournal: PostedJournal = {
      ...journal,
      status: 'POSTED',
      postedAt: new Date(),
      postedBy: 'system-user-id',
      transactionId: 'transaction-id'
    };

    this.journals.set(postedJournal.id, postedJournal);
    return postedJournal;
  }

  async reverse(journalId: string, reason: string): Promise<{ success: boolean; message: string }> {
    const journal = this.journals.get(journalId);
    if (!journal) {
      return { success: false, message: 'Journal not found' };
    }

    if (journal.status !== 'POSTED') {
      return { success: false, message: 'Only posted journals can be reversed' };
    }

    // In a real system, we would create a reversal journal
    // For this mock, we'll just mark it as reversed
    journal.status = 'REVERSED';
    this.journals.set(journalId, journal);

    return { success: true, message: 'Journal reversed successfully' };
  }
}

// Test function to demonstrate the accounting engine
async function testAccountingEngine() {
  console.log('Testing SUTRA Accounting Engine...\n');

  const engine = new MockAccountingEngine();

  // Create a test business event
  const saleEvent: BusinessEvent = {
    id: 'business-event-id',
    tenantId: 'test-tenant-id',
    eventType: 'SALE',
    occurredAt: new Date('2026-09-03'),
    amount: 1000,
    currency: 'USD',
    counterparty: 'Customer ABC',
    attributes: {
      invoiceNumber: 'INV-001',
      paymentMethod: 'Credit Card'
    },
    source: 'API',
    createdAt: new Date()
  };

  console.log('1. Evaluating business event:');
  console.log(`   Event Type: ${saleEvent.eventType}`);
  console.log(`   Amount: ${saleEvent.currency} ${saleEvent.amount}`);
  console.log(`   Counterparty: ${saleEvent.counterparty}\n`);

  // Evaluate the event
  const evaluation = await engine.evaluate(saleEvent);
  console.log('2. Policy Evaluation Result:');
  console.log(`   Matched: ${evaluation.matched}`);
  console.log(`   Reason: ${evaluation.reason}`);
  if (evaluation.matched) {
    console.log(`   Policy Version ID: ${evaluation.policyVersionId}`);
    console.log(`   Matched Rule IDs: ${evaluation.matchedRuleIds.join(', ')}`);
    console.log(`   Selected Rule ID: ${evaluation.selectedRuleId}\n`);
  }

  // Generate journal if matched
  if (evaluation.matched) {
    console.log('3. Generating journal entry:');
    const journal = await engine.generateJournal(saleEvent);
    console.log(`   Journal ID: ${journal.id}`);
    console.log(`   Status: ${journal.status}`);
    console.log(`   Description: ${journal.description}`);
    console.log(`   Lines: ${journal.lines.length}`);

    journal.lines.forEach((line, index) => {
      console.log(`     Line ${index + 1}:`);
      console.log(`       Account ID: ${line.accountId}`);
      console.log(`       Debit: ${line.debit > 0 ? line.debit : 0}`);
      console.log(`       Credit: ${line.credit > 0 ? line.credit : 0}`);
      console.log(`       Currency: ${line.currency}`);
    });

    // Validate double-entry principle
    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    console.log(`   Total Debits: ${totalDebits}`);
    console.log(`   Total Credits: ${totalCredits}`);
    console.log(`   Balanced: ${totalDebits === totalCredits}\n`);

    // Post the journal
    console.log('4. Posting journal to ledger:');
    const postedJournal = await engine.post(journal);
    console.log(`   Posted Journal ID: ${postedJournal.id}`);
    console.log(`   Status: ${postedJournal.status}`);
    console.log(`   Posted At: ${postedJournal.postedAt}`);
    console.log(`   Transaction ID: ${postedJournal.transactionId}\n`);

    // Test reversal
    console.log('5. Testing journal reversal:');
    const reversalResult = await engine.reverse(postedJournal.id, 'Test reversal');
    console.log(`   Success: ${reversalResult.success}`);
    console.log(`   Message: ${reversalResult.message}\n`);
  }

  console.log('Test completed successfully!');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAccountingEngine().catch(console.error);
}

export { MockAccountingEngine, testAccountingEngine };