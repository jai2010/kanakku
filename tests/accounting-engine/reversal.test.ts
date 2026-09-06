import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PostedJournal } from '../../src/domain/accounting/PostedJournal';

describe('Accounting Engine - Reversal (Production)', () => {
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
      id: id('acc-expenses'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: id('acc-cash'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));

    policyVersionRepository.add(createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-reversal'),
      policyId: id('pol-reversal'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-reversal'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  {
                    accountId: id('acc-expenses'),
                    side: 'DEBIT',
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Business Meals Expense'
                  },
                  {
                    accountId: id('acc-cash'),
                    side: 'CREDIT',
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Cash Payment'
                  }
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

  async function postPurchase(): Promise<PostedJournal> {
    const result = await accountingService.processEvent(createBusinessEvent({
      id: id('event-123'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      attributes: {}
    }));

    if (!result.postedJournal) {
      throw new Error(`Expected posted journal, got error: ${result.error}`);
    }
    return result.postedJournal;
  }

  it('posts and persists a reversal, and marks the original REVERSED', async () => {
    const posted = await postPurchase();

    const result = await accountingEngine.reversePostedJournal(posted, 'Test reversal', posted.tenantId);

    expect(result.status).toBe('SUCCESS');
    expect(result.message).toBe('Reversal journal generated successfully');
    expect(result.originalJournalId).toBe(posted.id);
    expect(result.reversalJournalId).toBeDefined();
    expect(result.reversalJournalId).not.toBe(posted.id);

    const storedOriginal = await journalRepository.getPostedJournal(posted.id);
    expect(storedOriginal?.status).toBe('REVERSED');
    expect(storedOriginal?.lines.find((line) => line.accountId === id('acc-expenses'))?.debit).toBe(7800);
    expect(storedOriginal?.lines.find((line) => line.accountId === id('acc-cash'))?.credit).toBe(7800);

    const reversalId = result.reversalJournalId;
    expect(reversalId).toBeDefined();
    if (reversalId === undefined) {
      return;
    }

    const storedReversal = await journalRepository.getPostedJournal(reversalId);
    expect(storedReversal).not.toBeNull();
    expect(storedReversal?.status).toBe('POSTED');
    expect(storedReversal?.businessEventId).toBe(posted.businessEventId);
    expect(storedReversal?.description).toBe(`Reversal of journal ${posted.id}`);
    expect(storedReversal?.lines.find((line) => line.accountId === id('acc-expenses'))?.credit).toBe(7800);
    expect(storedReversal?.lines.find((line) => line.accountId === id('acc-expenses'))?.debit).toBe(0);
    expect(storedReversal?.lines.find((line) => line.accountId === id('acc-cash'))?.debit).toBe(7800);
    expect(storedReversal?.lines.find((line) => line.accountId === id('acc-cash'))?.credit).toBe(0);
  });

  it('AccountingService.reverseJournal loads the persisted posted journal after processEvent', async () => {
    const posted = await postPurchase();

    const result = await accountingService.reverseJournal(posted.id, 'Test reversal', posted.tenantId);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Reversal journal generated successfully');
    expect(result.reversalJournalId).not.toBeNull();
    expect(result.originalJournalId).toBe(posted.id);

    const storedOriginal = await journalRepository.getPostedJournal(posted.id);
    expect(storedOriginal?.status).toBe('REVERSED');

    const reversalId = result.reversalJournalId;
    if (reversalId) {
      const storedReversal = await journalRepository.getPostedJournal(reversalId);
      expect(storedReversal?.status).toBe('POSTED');
    }
  });

  it('rejects reversal of a missing journal', async () => {
    const result = await accountingEngine.reverse(id('missing-journal-id'), 'Test reversal', id('tenant-1'));

    expect(result.status).toBe('JOURNAL_NOT_FOUND');
    expect(result.reversalJournalId).toBeUndefined();
    expect(result.originalJournalId).toBe(id('missing-journal-id'));
    expect(result.message).toBe('Journal not found');
  });

  it('rejects reversal of a journal that is not POSTED', async () => {
    const posted = await postPurchase();
    await journalRepository.savePostedJournal({
      ...posted,
      lines: posted.lines.map((line) => ({ ...line })),
      status: 'DRAFT'
    });

    const result = await accountingEngine.reverse(posted.id, 'Test reversal', posted.tenantId);

    expect(result.status).toBe('JOURNAL_NOT_POSTED');
    expect(result.reversalJournalId).toBeUndefined();
    expect(result.originalJournalId).toBe(posted.id);
    expect(result.message).toBe('Only posted journals can be reversed');
    expect(await journalRepository.getPostedJournal(posted.id)).toMatchObject({ status: 'DRAFT' });
  });

  it('rejects a second reversal of the same posted journal', async () => {
    const posted = await postPurchase();

    const first = await accountingEngine.reversePostedJournal(posted, 'First reversal', posted.tenantId);
    const second = await accountingEngine.reversePostedJournal(posted, 'Second reversal', posted.tenantId);

    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('ALREADY_REVERSED');
    expect(second.message).toBe('Journal has already been reversed');
    expect(second.reversalJournalId).toBeUndefined();
    expect(second.originalJournalId).toBe(posted.id);

    const stored = await journalRepository.findByBusinessEventId(posted.businessEventId, id('tenant-1'));
    const reversals = stored.filter((journal) => journal.description.startsWith('Reversal of journal '));
    expect(reversals).toHaveLength(1);
    expect(reversals[0].id).toBe(first.reversalJournalId);
  });
});
