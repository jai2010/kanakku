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

describe('Golden Scenario 1 - Simple Purchase (Production Pipeline)', () => {
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

  it('should generate correct journal for simple purchase through production pipeline', async () => {
    // Setup accounts
    const diningAccount = createAccount({
      id: id('acc-dining'),
      tenantId: id('tenant-1'),
      code: '5200',
      name: 'Dining Expense',
      type: 'EXPENSE',
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
    accountRepository.add(diningAccount);
    accountRepository.add(creditCardAccount);

    // Setup policy version for simple purchase
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: id('acc-dining'),
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Dining expense'
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
      id: id('rule-simple-purchase'),
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
      tenantId: id('tenant-1'),
      id: id('pv-simple-purchase'),
      policyId: id('pol-simple-purchase'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Add policy version to repository
    policyVersionRepository.add(policyVersion);

    // Setup business event
    const businessEvent = createBusinessEvent({
      id: id('evt-simple-purchase'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1500,
      currency: 'USD',
      counterparty: 'Restaurant XYZ',
      attributes: {},
      source: 'API'
    });

    // Process the event through the complete production pipeline
    const result = await accountingService.processEvent(businessEvent);

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.evaluation.matched).toBe(true);
    expect(result.evaluation.reason).toBe('MATCHED_RULE');
    expect(result.evaluation.selectedRuleId).toBe(id('rule-simple-purchase'));
    expect(result.evaluation.matchedRuleIds).toEqual([id('rule-simple-purchase')]);
    expect(result.evaluation.policyVersionId).toBe(policyVersion.id);

    expect(result.journal).not.toBeNull();
    expect(result.postedJournal).not.toBeNull();

    const journal = result.journal!;
    const postedJournal = result.postedJournal!;

    expect(journal.lines.length).toBe(2);
    expect(journal.status).toBe('DRAFT');
    expect(postedJournal.status).toBe('POSTED');

    // Find the dining expense line (should be debit)
    const diningLine = journal.lines.find((line: any) => line.accountId === id('acc-dining'));
    expect(diningLine).not.toBeUndefined();
    expect(diningLine?.debit).toBe(1500);
    expect(diningLine?.credit).toBe(0);

    // Find the credit card line (should be credit)
    const creditCardLine = journal.lines.find((line: any) => line.accountId === id('acc-credit-card'));
    expect(creditCardLine).not.toBeUndefined();
    expect(creditCardLine?.debit).toBe(0);
    expect(creditCardLine?.credit).toBe(1500);

    // Verify balancing
    const totalDebits = journal.lines.reduce((sum: number, line: any) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum: number, line: any) => sum + line.credit, 0);
    expect(totalDebits).toBe(1500);
    expect(totalCredits).toBe(1500);
    expect(totalDebits).toEqual(totalCredits);

    // Verify lineage
    expect(journal.policyVersionId).toBe(policyVersion.id);
    expect(journal.ruleId).toBe(id('rule-simple-purchase'));
    expect(journal.businessEventId).toBe(businessEvent.id);
  });
});