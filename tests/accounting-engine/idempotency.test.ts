import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';

describe('Accounting Engine - Idempotency (Production)', () => {
  let accountingService: AccountingService;
  let accountRepository: InMemoryAccountRepository;
  let policyVersionRepository: InMemoryPolicyVersionRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
    journalRepository = new InMemoryJournalRepository();
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
      id: id('pv-idempotency'),
      policyId: id('pol-idempotency'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-idempotency'),
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

  function purchaseEvent(eventId: string, amount: number) {
    return createBusinessEvent({
      id: eventId,
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    });
  }

  it('processes a business event for the first time and persists the posted journal', async () => {
    const result = await accountingService.processEvent(purchaseEvent(id('event-123'), 7800));

    expect(result.error).toBeUndefined();
    expect(result.evaluation.matched).toBe(true);
    expect(result.journal).toBeDefined();
    expect(result.postedJournal).toBeDefined();
    expect(result.postedJournal?.status).toBe('POSTED');
    expect(result.journal?.businessEventId).toBe(id('event-123'));

    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId !== undefined) {
      const stored = await journalRepository.getPostedJournal(postedId);
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe('POSTED');
      expect(stored?.businessEventId).toBe(id('event-123'));
    }
  });

  it('returns the existing posted journal on a second processEvent for the same event id', async () => {
    // Second call is a no-create: same persisted original, no second accounting journal.
    const event = purchaseEvent(id('event-456'), 5000);

    const first = await accountingService.processEvent(event);
    const second = await accountingService.processEvent(event);

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.postedJournal?.id).toBeDefined();
    expect(second.postedJournal?.id).toBe(first.postedJournal?.id);
    expect(second.postedJournal?.transactionId).toBe(first.postedJournal?.transactionId);
    expect(second.evaluation.selectedRuleId).toBe(id('rule-idempotency'));
    expect(second.evaluation.policyVersionId).toBe(id('pv-idempotency'));

    const stored = await journalRepository.findByBusinessEventId(event.id, id('tenant-1'));
    const originals = stored.filter((journal) => !journal.description.startsWith('Reversal of journal '));
    expect(originals).toHaveLength(1);
    expect(originals[0].id).toBe(first.postedJournal?.id);
  });

  it('processes different event ids independently', async () => {
    const first = await accountingService.processEvent(purchaseEvent(id('event-001'), 3000));
    const second = await accountingService.processEvent(purchaseEvent(id('event-002'), 1500));

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.journal?.businessEventId).toBe(id('event-001'));
    expect(second.journal?.businessEventId).toBe(id('event-002'));
    expect(first.postedJournal?.id).not.toBe(second.postedJournal?.id);
    expect(first.journal?.lines[0].debit).toBe(3000);
    expect(second.journal?.lines[0].debit).toBe(1500);
    expect(await journalRepository.findByBusinessEventId(id('event-001'), id('tenant-1'))).toHaveLength(1);
    expect(await journalRepository.findByBusinessEventId(id('event-002'), id('tenant-1'))).toHaveLength(1);
  });

  it('does not create a new original journal after the existing one has been reversed', async () => {
    const event = purchaseEvent(id('event-reversed-idempotent'), 5000);
    const first = await accountingService.processEvent(event);
    const postedId = first.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const reversal = await accountingService.reverseJournal(postedId, 'correction', event.tenantId);
    expect(reversal.success).toBe(true);

    const second = await accountingService.processEvent(event);
    expect(second.error).toBeUndefined();
    expect(second.postedJournal?.id).toBe(postedId);
    expect(second.postedJournal?.status).toBe('REVERSED');

    const stored = await journalRepository.findByBusinessEventId(event.id, id('tenant-1'));
    const originals = stored.filter((journal) => !journal.description.startsWith('Reversal of journal '));
    expect(originals).toHaveLength(1);
    expect(originals[0].status).toBe('REVERSED');
  });

  it('treats events with the same attributes but different ids as distinct events', async () => {
    const first = await accountingService.processEvent(purchaseEvent(id('event-abc'), 7800));
    const second = await accountingService.processEvent(purchaseEvent(id('event-def'), 7800));

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.journal?.businessEventId).toBe(id('event-abc'));
    expect(second.journal?.businessEventId).toBe(id('event-def'));
    expect(first.postedJournal?.id).not.toBe(second.postedJournal?.id);
  });
});
