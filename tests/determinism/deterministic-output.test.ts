import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
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

describe('Accounting Engine - Determinism (Production Pipeline)', () => {
  let accountingService: AccountingService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    // Initialize repositories
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();

    // Initialize service
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

  // Helper to create a consistent test scenario
  const createTestScenario = () => {
    // Chart of accounts (deterministic setup)
    const cashAccount = createAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    const businessMealsAccount = createAccount({
      id: id('acc-5200'),
      tenantId: id('tenant-1'),
      code: '5200',
      name: 'Business Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    // Add accounts to repository
    accountRepository.add(cashAccount);
    accountRepository.add(businessMealsAccount);

    // Policy version (deterministic setup)
    const treatment: AccountingTreatment = {
      lines: [
        {
          accountId: id('acc-5200'),
          side: 'DEBIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Business Meals Expense'
        },
        {
          accountId: id('acc-1000'),
          side: 'CREDIT' as const,
          amount: { type: 'EVENT_AMOUNT' },
          description: 'Cash Payment'
        }
      ]
    };

    const rule: Rule = {
      id: id('rule-starbucks-meals'),
      priority: 100,
      when: {
        AND: [
          { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
          { field: 'counterparty', operator: 'equals', value: 'Starbucks' },
          { field: 'amount', operator: 'greater_than', value: 5000 }
        ]
      },
      then: { treatment }
    };

    const policyIR: PolicyIR = { rules: [rule] };

    const policyVersion = createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-1'),
      policyId: id('pol-starbucks-meals'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: policyIR
    });

    // Add policy version to repository
    policyVersionRepository.add(policyVersion);

    // Business event (deterministic setup)
    const event = createBusinessEvent({
      id: id('evt-determinism-test'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03T10:30:00Z'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {},
      source: 'API'
    });

    return { event, policyVersion, cashAccount, businessMealsAccount };
  };

  it('should produce identical output for same inputs (determinism test)', async () => {
    const { event, policyVersion, cashAccount, businessMealsAccount } = createTestScenario();
    const inputs = { event, policyVersion };

    // Run the process multiple times
    const results = [];
    const iterations = 1000; // As suggested in requirements

    for (let i = 0; i < iterations; i++) {
      // Create fresh service instances for each iteration to ensure clean state
      const accRepo = new InMemoryAccountRepository();
      const polRepo = new InMemoryPolicyVersionRepository();
      const jourRepo = new InMemoryJournalRepository();

      // Add the same accounts and policy version to each fresh instance
      accRepo.add(cashAccount);
      accRepo.add(businessMealsAccount);
      polRepo.add(policyVersion);

      const svc = new AccountingService({
        policyVersionRepository: polRepo,
        accountRepository: accRepo,
        journalRepository: jourRepo
      });

      const result = await svc.processEvent(event);
      results.push(result);
    }

    // All results should be identical
    const firstResult = results[0];

    for (let i = 1; i < results.length; i++) {
      const result = results[i];

      // Check evaluation matched status
      expect(result.evaluation.matched).toBe(firstResult.evaluation.matched);

      // Check evaluation reason
      expect(result.evaluation.reason).toBe(firstResult.evaluation.reason);

      // If matched, check evaluation details
      if (result.evaluation.matched && firstResult.evaluation.matched) {
        expect(result.evaluation.selectedRuleId).toBe(firstResult.evaluation.selectedRuleId);
        expect(result.evaluation.matchedRuleIds).toEqual(firstResult.evaluation.matchedRuleIds);
        expect(result.evaluation.policyVersionId).toBe(firstResult.evaluation.policyVersionId);
      }

      // If journal was generated, check journal details
      if (result.journal && firstResult.journal) {
        // Check journal ID (should be different each time due to randomUUID, but we can check other deterministic fields)
        // Note: Journal IDs are randomly generated, so we won't check ID equality

        // Check tenant ID
        expect(result.journal.tenantId).toBe(firstResult.journal.tenantId);

        // Check business event ID
        expect(result.journal.businessEventId).toBe(firstResult.journal.businessEventId);

        // Check accounting transaction ID (also randomly generated)

        // Check policy version ID
        expect(result.journal.policyVersionId).toBe(firstResult.journal.policyVersionId);

        // Check rule ID
        expect(result.journal.ruleId).toBe(firstResult.journal.ruleId);

        // Check transaction date (should be based on event date)
        expect(result.journal.transactionDate.getTime()).toBe(firstResult.journal.transactionDate.getTime());

        // Check currency
        expect(result.journal.currency).toBe(firstResult.journal.currency);

        // Check description (this might vary slightly due to timing, but should be based on event type)
        expect(result.journal.description).toContain(`Journal for ${event.eventType} event`);

        // Check status
        expect(result.journal.status).toBe(firstResult.journal.status);

        // Check lines count
        expect(result.journal.lines.length).toBe(firstResult.journal.lines.length);

        // Check each line
        for (let j = 0; j < result.journal.lines.length; j++) {
          const line = result.journal.lines[j];
          const firstLine = firstResult.journal.lines[j];

          expect(line.accountId).toBe(firstLine.accountId);
          expect(line.debit).toBe(firstLine.debit);
          expect(line.credit).toBe(firstLine.credit);
          expect(line.currency).toBe(firstLine.currency);
          expect(line.description).toBe(firstLine.description);
        }
      }

      // If posted journal was generated, check posted journal details
      if (result.postedJournal && firstResult.postedJournal) {
        // Check status
        expect(result.postedJournal.status).toBe(firstResult.postedJournal.status);

        // Check postedAt (will vary, but we can check it exists)
        expect(result.postedJournal.postedAt).toBeDefined();

        // Check postedBy
        expect(result.postedJournal.postedBy).toBe(firstResult.postedJournal.postedBy);

        // Check transactionId (randomly generated)
      }
    }

    // If we got here, all results were functionally identical in terms of business logic
    expect(true).toBe(true); // This test passes if we reach this point
  });

  it('should produce different output when inputs change', async () => {
    const { event, policyVersion, cashAccount, businessMealsAccount } = createTestScenario();

    // Change the event amount
    const modifiedEvent = createBusinessEvent({
      ...event,
      amount: 3000 // Below the 5000 threshold
    });

    const inputs1 = { event, policyVersion };
    const inputs2 = { event: modifiedEvent, policyVersion };

    // Create fresh service instances
    const accRepo1 = new InMemoryAccountRepository();
    const polRepo1 = new InMemoryPolicyVersionRepository();
    const jourRepo1 = new InMemoryJournalRepository();
    accRepo1.add(cashAccount);
    accRepo1.add(businessMealsAccount);
    polRepo1.add(policyVersion);

    const accRepo2 = new InMemoryAccountRepository();
    const polRepo2 = new InMemoryPolicyVersionRepository();
    const jourRepo2 = new InMemoryJournalRepository();
    accRepo2.add(cashAccount);
    accRepo2.add(businessMealsAccount);
    polRepo2.add(policyVersion);

    const svc1 = new AccountingService({
      policyVersionRepository: polRepo1,
      accountRepository: accRepo1,
      journalRepository: jourRepo1
    });

    const svc2 = new AccountingService({
      policyVersionRepository: polRepo2,
      accountRepository: accRepo2,
      journalRepository: jourRepo2
    });

    const result1 = await svc1.processEvent(event);
    const result2 = await svc2.processEvent(modifiedEvent);

    // With amount 7800, should match the rule
    // With amount 3000, should not match the rule (amount not > 5000)
    expect(result1.evaluation.matched).toBe(true);
    expect(result2.evaluation.matched).toBe(false);

    // Results should be different
    expect(result1.evaluation.matched).not.toBe(result2.evaluation.matched);
  });

  it('should produce different output when policy changes', async () => {
    const { event, policyVersion, cashAccount, businessMealsAccount } = createTestScenario();

    // Change the policy version ID
    const modifiedPolicyVersion = createPolicyVersion({
      ...policyVersion,
      id: id('pv-modified'),
      policyId: id('pol-modified')
    });

    const inputs1 = { event, policyVersion };
    const inputs2 = { event, policyVersion: modifiedPolicyVersion };

    // Create fresh service instances
    const accRepo1 = new InMemoryAccountRepository();
    const polRepo1 = new InMemoryPolicyVersionRepository();
    const jourRepo1 = new InMemoryJournalRepository();
    accRepo1.add(cashAccount);
    accRepo1.add(businessMealsAccount);
    polRepo1.add(policyVersion);

    const accRepo2 = new InMemoryAccountRepository();
    const polRepo2 = new InMemoryPolicyVersionRepository();
    const jourRepo2 = new InMemoryJournalRepository();
    accRepo2.add(cashAccount);
    accRepo2.add(businessMealsAccount);
    polRepo2.add(modifiedPolicyVersion);

    const svc1 = new AccountingService({
      policyVersionRepository: polRepo1,
      accountRepository: accRepo1,
      journalRepository: jourRepo1
    });

    const svc2 = new AccountingService({
      policyVersionRepository: polRepo2,
      accountRepository: accRepo2,
      journalRepository: jourRepo2
    });

    const result1 = await svc1.processEvent(event);
    const result2 = await svc2.processEvent(event);

    // Both should match (same logic) but policy version IDs should differ
    expect(result1.evaluation.matched).toBe(true);
    expect(result2.evaluation.matched).toBe(true);

    // Policy version IDs should be different due to different policy version ID
    expect(result1.evaluation.policyVersionId).toBe(id('pv-1'));
    expect(result2.evaluation.policyVersionId).toBe(id('pv-modified'));
  });
});