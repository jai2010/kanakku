import { id } from '../fixtures/ids';
import { PolicyDslService } from '../../src/application/policies/PolicyDslService';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import {
  ACCOUNT_1000,
  ACCOUNT_1800,
  ACCOUNT_2000,
  ACCOUNT_5100,
  ACCOUNT_5220,
  ACCOUNT_MAP,
  ACTIVE_COMPILE_OPTIONS,
  BUSINESS_MEALS_DSL,
  TENANT_ID
} from './fixtures';

describe('SUTRA Policy DSL production pipeline', () => {
  it('DSL → parse → compile → PolicyIR → PolicyEngine → AccountingEngine → balanced POSTED journal', async () => {
    const accountRepository = new InMemoryAccountRepository();
    const policyVersionRepository = new InMemoryPolicyVersionRepository();
    const journalRepository = new InMemoryJournalRepository();

    accountRepository.add(createAccount({
      id: ACCOUNT_5220,
      tenantId: TENANT_ID,
      code: '5220',
      name: 'Business Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: ACCOUNT_2000,
      tenantId: TENANT_ID,
      code: '2000',
      name: 'Credit Card Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));

    const dsl = new PolicyDslService();
    const policyVersion = dsl.compile(BUSINESS_MEALS_DSL, ACTIVE_COMPILE_OPTIONS);
    policyVersionRepository.add(policyVersion);

    const accountingService = new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    });

    const event = createBusinessEvent({
      id: id('dsl-evt-starbucks'),
      tenantId: TENANT_ID,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });

    const result = await accountingService.processEvent(event);

    expect(result.error).toBeUndefined();
    expect(result.evaluation.matched).toBe(true);
    expect(result.evaluation.reason).toBe('MATCHED_RULE');
    expect(result.evaluation.selectedRuleId).toBe(policyVersion.definition.rules[0]?.id);
    const journal = result.journal;
    const postedJournal = result.postedJournal;
    if (journal === undefined || postedJournal === undefined) {
      throw new Error('expected journal and posted journal from DSL pipeline');
    }
    expect(postedJournal.status).toBe('POSTED');

    const totalDebits = journal.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journal.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(totalDebits).toBe(7800);
    expect(totalCredits).toBe(7800);
    expect(journal.lines).toEqual([
      expect.objectContaining({ accountId: ACCOUNT_5220, debit: 7800, credit: 0 }),
      expect.objectContaining({ accountId: ACCOUNT_2000, debit: 0, credit: 7800 })
    ]);

    const persisted = await journalRepository.getPostedJournal(postedJournal.id);
    expect(persisted?.status).toBe('POSTED');
    expect(persisted?.id).toBe(postedJournal.id);
  });

  it('executes a multi-line DSL treatment through PolicyEngineService and AccountingEngineService', async () => {
    const accountRepository = new InMemoryAccountRepository();
    const journalRepository = new InMemoryJournalRepository();
    accountRepository.add(createAccount({
      id: ACCOUNT_5100,
      tenantId: TENANT_ID,
      code: '5100',
      name: 'Travel',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: ACCOUNT_1800,
      tenantId: TENANT_ID,
      code: '1800',
      name: 'Input Tax',
      type: 'ASSET',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: ACCOUNT_1000,
      tenantId: TENANT_ID,
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));

    const policyVersion = new PolicyDslService().compile(`
POLICY "Split"
VERSION 1
EFFECTIVE FROM "2026-01-01"
RULE "split"
PRIORITY 25
WHEN
eventType = "PURCHASE"
AND attributes.invoiceType = "SPLIT"
THEN
DEBIT ACCOUNT "5100" AMOUNT ATTRIBUTE_AMOUNT travelAmount DESCRIPTION "Travel"
DEBIT ACCOUNT "1800" AMOUNT FIXED_AMOUNT 100 "USD" DESCRIPTION "Tax"
CREDIT ACCOUNT "1000" AMOUNT EVENT_AMOUNT DESCRIPTION "Cash"
`, ACTIVE_COMPILE_OPTIONS);

    const event = createBusinessEvent({
      id: id('dsl-evt-split'),
      tenantId: TENANT_ID,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-04-01'),
      amount: 600,
      currency: 'USD',
      attributes: { invoiceType: 'SPLIT', travelAmount: 500 }
    });

    const policyEngine = new PolicyEngineService();
    const evaluation = policyEngine.evaluate(event, policyVersion);
    expect(evaluation.reason).toBe('MATCHED_RULE');
    expect(evaluation.selectedTreatment?.lines).toHaveLength(3);

    const accountingEngine = new AccountingEngineService({
      dependencies: { accountRepository, journalRepository }
    });
    const journal = await accountingEngine.generateJournal(event, policyVersion);
    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
    const posted = await accountingEngine.post(journal);
    expect(posted.status).toBe('POSTED');
    expect(journal.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.debit,
      credit: line.credit
    }))).toEqual([
      { accountId: ACCOUNT_5100, debit: 500, credit: 0 },
      { accountId: ACCOUNT_1800, debit: 100, credit: 0 },
      { accountId: ACCOUNT_1000, debit: 0, credit: 600 }
    ]);
  });

  it('keeps the programmatic PolicyIR path working alongside DSL compile', async () => {
    const accountRepository = new InMemoryAccountRepository();
    const policyVersionRepository = new InMemoryPolicyVersionRepository();
    const journalRepository = new InMemoryJournalRepository();
    accountRepository.add(createAccount({
      id: ACCOUNT_5220,
      tenantId: TENANT_ID,
      code: '5220',
      name: 'Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: ACCOUNT_2000,
      tenantId: TENANT_ID,
      code: '2000',
      name: 'Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));

    policyVersionRepository.add(createPolicyVersion({
      id: id('dsl-programmatic-pv'),
      policyId: id('dsl-programmatic-policy'),
      tenantId: TENANT_ID,
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('dsl-programmatic-rule'),
            priority: 1,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: ACCOUNT_5220, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: ACCOUNT_2000, side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    }));

    const result = await new AccountingService({
      policyVersionRepository,
      accountRepository,
      journalRepository
    }).processEvent(createBusinessEvent({
      id: id('dsl-programmatic-event'),
      tenantId: TENANT_ID,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 50,
      currency: 'USD',
      attributes: {}
    }));

    expect(result.error).toBeUndefined();
    expect(result.postedJournal?.status).toBe('POSTED');
    expect(ACCOUNT_MAP.get('5220')).toBe(ACCOUNT_5220);
  });
});
