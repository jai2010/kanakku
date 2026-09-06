import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';

describe('Golden Scenario 2 - Purchase with Tax (Production Pipeline)', () => {
  let accountingService: AccountingService;
  let policyEngine: PolicyEngineService;
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    // Initialize repositories
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();

    // Initialize services
    policyEngine = new PolicyEngineService();
    accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository,
        journalRepository
      }
    });
    accountingService = new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    });
  });

  afterEach(() => {
    // Clear repositories for test isolation
    accountRepository.clear();
    policyVersionRepository.clear();
    journalRepository.clear();
  });

  it('should generate correct journal for purchase with tax through production pipeline', async () => {
    // Setup accounts
    const expenseAccount = createAccount({
      id: id('acc-expense'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const taxReceivableAccount = createAccount({
      id: id('acc-tax-receivable'),
      tenantId: id('tenant-1'),
      code: '1800',
      name: 'Tax Receivable',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const payableAccount = createAccount({
      id: id('acc-payable'),
      tenantId: id('tenant-1'),
      code: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    // Add accounts to repository
    accountRepository.add(expenseAccount);
    accountRepository.add(taxReceivableAccount);
    accountRepository.add(payableAccount);

    // Setup policy version for purchase with tax
    // In this example, we'll assume the tax amount is known or can be calculated
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: id('acc-expense'),
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Expense amount'
        },
        {
          accountId: id('acc-tax-receivable'),
          side: 'DEBIT' as const,
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' },
          description: 'Tax receivable'
        },
        {
          accountId: id('acc-payable'),
          side: 'CREDIT' as const,
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'totalAmount' },
          description: 'Total payable'
        }
      ]
    };

    const rule: Rule = {
      id: id('rule-purchase-with-tax'),
      priority: 100,
      when: {
        AND: [
          { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          { field: 'attributes.hasTax', operator: 'equals', value: true }
        ]
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-purchase-with-tax'),
      policyId: id('pol-purchase-with-tax'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Add policy version to repository
    policyVersionRepository.add(policyVersion);

    // Setup business event with tax information
    const businessEvent = createBusinessEvent({
      id: id('evt-purchase-with-tax'),
      tenantId: id('tenant-1'),
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

    // Process the event through the complete production pipeline
    const result = await accountingService.processEvent(businessEvent);

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.evaluation.matched).toBe(true);
    expect(result.evaluation.reason).toBe('MATCHED_RULE');
    expect(result.evaluation.selectedRuleId).toBe(id('rule-purchase-with-tax'));
    expect(result.evaluation.matchedRuleIds).toEqual([id('rule-purchase-with-tax')]);
    expect(result.evaluation.policyVersionId).toBe(policyVersion.id);

    expect(result.journal).not.toBeNull();
    expect(result.postedJournal).not.toBeNull();

    const journal = result.journal!;
    const postedJournal = result.postedJournal!;

    expect(journal.lines.length).toBe(3);
    expect(journal.status).toBe('DRAFT');
    expect(postedJournal.status).toBe('POSTED');

    // Find and verify each line
    const expenseLine = journal.lines.find((line: any) => line.accountId === id('acc-expense'));
    expect(expenseLine).not.toBeUndefined();
    expect(expenseLine?.debit).toBe(8200); // Base expense amount
    expect(expenseLine?.credit).toBe(0);

    const taxReceivableLine = journal.lines.find((line: any) => line.accountId === id('acc-tax-receivable'));
    expect(taxReceivableLine).not.toBeUndefined();
    expect(taxReceivableLine?.debit).toBe(1000); // Tax amount
    expect(taxReceivableLine?.credit).toBe(0);

    const payableLine = journal.lines.find((line: any) => line.accountId === id('acc-payable'));
    expect(payableLine).not.toBeUndefined();
    expect(payableLine?.debit).toBe(0);
    expect(payableLine?.credit).toBe(9200); // Total amount (expense + tax)

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum: number, line: any) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: any) => sum + line.credit, 0);
    expect(totalDebits).toBe(9200);
    expect(totalCredits).toBe(9200);
    expect(totalDebits).toEqual(totalCredits);

    // Verify lineage
    expect(journal.policyVersionId).toBe(policyVersion.id);
    expect(journal.ruleId).toBe(id('rule-purchase-with-tax'));
    expect(journal.businessEventId).toBe(businessEvent.id);
  });
});