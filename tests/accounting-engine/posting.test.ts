import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { Journal } from '../../src/domain/accounting/Journal';

describe('Accounting Engine - Posting Persistence (Production)', () => {
  let accountingService: AccountingService;
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();
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

    accountRepository.add(createAccount({
      id: id('acc-5000'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));

    policyVersionRepository.add(createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-posting'),
      policyId: id('pol-posting'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-posting'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-5000'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-1000'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    }));
  });

  afterEach(() => {
    accountRepository.clear();
    policyVersionRepository.clear();
    journalRepository.clear();
  });

  it('processEvent persists a POSTED journal that can be reloaded', async () => {
    const result = await accountingService.processEvent(createBusinessEvent({
      id: id('evt-posting'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1500,
      currency: 'USD',
      attributes: {}
    }));

    expect(result.error).toBeUndefined();
    expect(result.postedJournal?.status).toBe('POSTED');

    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const stored = await journalRepository.getPostedJournal(postedId);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('POSTED');
    expect(stored?.businessEventId).toBe(id('evt-posting'));
    expect(stored?.lines).toHaveLength(2);
  });

  it('post() still validates before a journal becomes POSTED', async () => {
    const unbalanced: Journal = {
      id: id('journal-unbalanced'),
      tenantId: id('tenant-1'),
      businessEventId: id('evt-unbalanced'),
      accountingTransactionId: id('txn-unbalanced'),
      transactionDate: new Date('2026-09-03'),
      currency: 'USD',
      description: 'Unbalanced journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('journal-unbalanced'),
          accountId: id('acc-5000'),
          debit: 1500,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('journal-unbalanced'),
          accountId: id('acc-1000'),
          debit: 0,
          credit: 900,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date('2026-09-03')
    };

    await expect(accountingEngine.post(unbalanced)).rejects.toThrow('Cannot post invalid journal: JOURNAL_NOT_BALANCED');
    expect(await journalRepository.getPostedJournal(unbalanced.id)).toBeNull();
  });

  it('mutating the draft journal does not mutate the posted or persisted journal', async () => {
    const event = createBusinessEvent({
      id: id('evt-immutability'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1500,
      currency: 'USD',
      attributes: {}
    });
    const policyVersion = await policyVersionRepository.getActivePolicyVersion(
      event.tenantId,
      event.occurredAt
    );
    if (!policyVersion) {
      throw new Error('Expected an active policy version');
    }

    const draft = await accountingEngine.generateJournal(event, policyVersion);
    const originalDebit = draft.lines[0].debit;
    const posted = await accountingEngine.post(draft);

    draft.lines[0].debit = originalDebit + 999;
    if (draft.lines[0].description !== undefined) {
      draft.lines[0].description = 'mutated draft';
    }

    expect(posted.lines[0].debit).toBe(originalDebit);
    expect(posted.lines[0].description).not.toBe('mutated draft');
    expect(posted.lines).not.toBe(draft.lines);
    expect(posted.lines[0]).not.toBe(draft.lines[0]);

    const stored = await journalRepository.getPostedJournal(posted.id);
    expect(stored?.lines[0].debit).toBe(originalDebit);
    expect(stored?.lines[0].description).not.toBe('mutated draft');
  });
});
