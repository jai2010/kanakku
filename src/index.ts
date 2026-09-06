import { AccountingService } from './application/accounting/AccountingService';
import { InMemoryAccountRepository } from './infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from './infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from './infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from './domain/accounting/Account';
import { createBusinessEvent } from './domain/events/BusinessEvent';
import { createPolicyVersion } from './domain/policies/PolicyVersion';

console.log('Starting SUTRA Accounting Engine...');

const accountRepo = new InMemoryAccountRepository();
const policyVersionRepo = new InMemoryPolicyVersionRepository();
const journalRepo = new InMemoryJournalRepository();

const tenantId = crypto.randomUUID();

const cashAccount = createAccount({
  tenantId,
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  status: 'ACTIVE'
});

const revenueAccount = createAccount({
  tenantId,
  code: '4000',
  name: 'Revenue',
  type: 'INCOME',
  status: 'ACTIVE'
});

async function main(): Promise<void> {
accountRepo.add(cashAccount);
accountRepo.add(revenueAccount);

const policyVersion = createPolicyVersion({
  policyId: crypto.randomUUID(),
  tenantId,
  version: 1,
  effectiveFrom: new Date('2026-01-01'),
  status: 'ACTIVE',
  definition: {
    rules: [
      {
        id: crypto.randomUUID(),
        priority: 100,
        when: {
          AND: [
            {
              field: 'eventType',
              operator: 'equals',
              value: 'PURCHASE'
            }
          ]
        },
        then: {
          treatment: {
            lines: [
              {
                accountId: cashAccount.id,
                side: 'DEBIT',
                amount: {
                  type: 'EVENT_AMOUNT'
                }
              },
              {
                accountId: revenueAccount.id,
                side: 'CREDIT',
                amount: {
                  type: 'EVENT_AMOUNT'
                }
              }
            ]
          }
        }
      }
    ]
  }
});

policyVersionRepo.add(policyVersion);

const accountingService = new AccountingService({
  policyVersionRepository: policyVersionRepo,
  accountRepository: accountRepo,
  journalRepository: journalRepo
});

const saleEvent = createBusinessEvent({
  tenantId,
  eventType: 'PURCHASE',
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
});

console.log('Processing business event through SUTRA Accounting Engine...\n');

const result = await accountingService.processEvent(saleEvent);

if (result.error) {
  console.error('Error processing event:', result.error);
  process.exit(1);
}

console.log('✓ Event processed successfully!\n');

if (result.evaluation.matched) {
  console.log('Policy Evaluation:');
  console.log(`  Matched: ${result.evaluation.matched}`);
  console.log(`  Policy Version ID: ${result.evaluation.policyVersionId}`);
  console.log(`  Selected Rule ID: ${result.evaluation.selectedRuleId}`);
  console.log(`  Reason: ${result.evaluation.reason}\n`);
}

if (result.journal) {
  console.log('Generated Journal:');
  console.log(`  Journal ID: ${result.journal.id}`);
  console.log(`  Status: ${result.journal.status}`);
  console.log(`  Description: ${result.journal.description}`);
  console.log(`  Lines: ${result.journal.lines.length}`);

  result.journal.lines.forEach((line, index: number) => {
    console.log(`    Line ${index + 1}:`);
    console.log(`      Account ID: ${line.accountId}`);
    console.log(`      Debit: ${line.debit}`);
    console.log(`      Credit: ${line.credit}`);
    console.log(`      Currency: ${line.currency}`);
    console.log(`      Description: ${line.description}`);
  });

  const totalDebits = result.journal.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = result.journal.lines.reduce((sum, line) => sum + line.credit, 0);
  console.log(`  Total Debits: ${totalDebits}`);
  console.log(`  Total Credits: ${totalCredits}`);
  console.log(`  Balanced: ${totalDebits === totalCredits}\n`);
}

if (result.postedJournal) {
  console.log('Posted Journal:');
  console.log(`  Posted Journal ID: ${result.postedJournal.id}`);
  console.log(`  Status: ${result.postedJournal.status}`);
  console.log(`  Posted At: ${result.postedJournal.postedAt}`);
  console.log(`  Transaction ID: ${result.postedJournal.transactionId}\n`);
}

console.log('SUTRA Accounting Engine demonstration completed successfully!');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
