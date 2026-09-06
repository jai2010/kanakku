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

describe('Golden Scenario 3 - Split Allocation (Multi-line Journal) (Production Pipeline)', () => {
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

  it('should generate correct journal for split allocation through production pipeline', async () => {
    // Setup accounts
    const travelAccount = createAccount({
      id: id('acc-travel'),
      tenantId: id('tenant-1'),
      code: '5100',
      name: 'Travel Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const entertainmentAccount = createAccount({
      id: id('acc-entertainment'),
      tenantId: id('tenant-1'),
      code: '5200',
      name: 'Entertainment Expense',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const taxAccount = createAccount({
      id: id('acc-input-tax'),
      tenantId: id('tenant-1'),
      code: '1800',
      name: 'Input Tax Receivable',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const creditCardAccount = createAccount({
      id: id('acc-credit-card'),
      tenantId: id('tenant-1'),
      code: '2000',
      name: 'Credit Card Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    });

    // Add accounts to repository
    accountRepository.add(travelAccount);
    accountRepository.add(entertainmentAccount);
    accountRepository.add(taxAccount);
    accountRepository.add(creditCardAccount);

    // Setup policy version for split allocation
    // Note: For this test, we'll use a simplified rule that matches the event type and attributes
    // In a real implementation, we might have more complex expressions for splitting
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: id('acc-travel'),
          side: 'DEBIT' as const,
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'travelAmount' },
          description: 'Travel portion'
        },
        {
          accountId: id('acc-entertainment'),
          side: 'DEBIT' as const,
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'entertainmentAmount' },
          description: 'Entertainment portion'
        },
        {
          accountId: id('acc-input-tax'),
          side: 'DEBIT' as const,
          amount: { type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' },
          description: 'Input tax portion'
        },
        {
          accountId: id('acc-credit-card'),
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Credit card payment'
        }
      ]
    };

    const rule: Rule = {
      id: id('rule-split-allocation'),
      priority: 100,
      when: {
        AND: [
          { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          { field: 'attributes.invoiceType', operator: 'equals', value: 'SPLIT' }
        ]
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-split-allocation'),
      policyId: id('pol-split-allocation'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Add policy version to repository
    policyVersionRepository.add(policyVersion);

    // Setup business event with attributes for splitting
    const businessEvent = createBusinessEvent({
      id: id('evt-split-allocation'),
      tenantId: id('tenant-1'),
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

    // Process the event through the complete production pipeline
    const result = await accountingService.processEvent(businessEvent);

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.evaluation.matched).toBe(true);
    expect(result.evaluation.reason).toBe('MATCHED_RULE');
    expect(result.evaluation.selectedRuleId).toBe(id('rule-split-allocation'));
    expect(result.evaluation.matchedRuleIds).toEqual([id('rule-split-allocation')]);
    expect(result.evaluation.policyVersionId).toBe(policyVersion.id);

    expect(result.journal).not.toBeNull();
    expect(result.postedJournal).not.toBeNull();

    const journal = result.journal!;
    const postedJournal = result.postedJournal!;

    expect(journal.lines.length).toBe(4);
    expect(journal.status).toBe('DRAFT');
    expect(postedJournal.status).toBe('POSTED');

    // Find and verify each line
    const travelLine = journal.lines.find(line => line.accountId === id('acc-travel'));
    expect(travelLine).not.toBeUndefined();
    expect(travelLine?.debit).toBe(6000);
    expect(travelLine?.credit).toBe(0);

    const entertainmentLine = journal.lines.find(line => line.accountId === id('acc-entertainment'));
    expect(entertainmentLine).not.toBeUndefined();
    expect(entertainmentLine?.debit).toBe(2000);
    expect(entertainmentLine?.credit).toBe(0);

    const taxLine = journal.lines.find(line => line.accountId === id('acc-input-tax'));
    expect(taxLine).not.toBeUndefined();
    expect(taxLine?.debit).toBe(1000);
    expect(taxLine?.credit).toBe(0);

    const creditCardLine = journal.lines.find(line => line.accountId === id('acc-credit-card'));
    expect(creditCardLine).not.toBeUndefined();
    expect(creditCardLine?.debit).toBe(0);
    expect(creditCardLine?.credit).toBe(9000);

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(totalDebits).toBe(9000);
    expect(totalCredits).toBe(9000);
    expect(totalDebits).toEqual(totalCredits);

    // Verify lineage
    expect(journal.policyVersionId).toBe(policyVersion.id);
    expect(journal.ruleId).toBe(id('rule-split-allocation'));
    expect(journal.businessEventId).toBe(businessEvent.id);
  });
});