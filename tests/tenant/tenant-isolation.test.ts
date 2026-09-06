import { id } from '../fixtures/ids';
import { AccountingService } from '../../src/application/accounting/AccountingService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';

describe('Tenant isolation (Production)', () => {
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

    for (const tenant of [id('tenant-a'), id('tenant-b')]) {
      accountRepository.add(createAccount({
        id: id(`${tenant}-cash`),
        tenantId: tenant,
        code: '1000',
        name: 'Cash',
        type: 'ASSET'
      }));
      accountRepository.add(createAccount({
        id: id(`${tenant}-expense`),
        tenantId: tenant,
        code: '5000',
        name: 'Expense',
        type: 'EXPENSE'
      }));
      policyVersionRepository.add(createPolicyVersion({
        id: id(`${tenant}-pv`),
        policyId: id(`${tenant}-pol`),
        tenantId: tenant,
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        definition: {
          rules: [
            {
              id: id(`${tenant}-rule`),
              priority: 100,
              when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
              then: {
                treatment: {
                  lines: [
                    { accountId: id(`${tenant}-expense`), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                    { accountId: id(`${tenant}-cash`), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                  ]
                }
              }
            }
          ]
        }
      }));
    }
  });

  afterEach(() => {
    accountRepository.clear();
    policyVersionRepository.clear();
    journalRepository.clear();
  });

  function purchase(tenantId: string, eventId: string) {
    return createBusinessEvent({
      id: eventId,
      tenantId,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1000,
      currency: 'USD',
      attributes: {}
    });
  }

  it('does not select tenant B policy for tenant A', async () => {
    const selected = await policyVersionRepository.getActivePolicyVersion(
      id('tenant-a'),
      new Date('2026-09-03')
    );
    expect(selected?.id).toBe(id(`${id('tenant-a')}-pv`));
    expect(selected?.tenantId).toBe(id('tenant-a'));
  });

  it('does not let tenant A post using tenant B accounts', async () => {
    policyVersionRepository.clear();
    policyVersionRepository.add(createPolicyVersion({
      id: id('cross-account-pv'),
      policyId: id('cross-account-pol'),
      tenantId: id('tenant-a'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('cross-account-rule'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: id(`${id('tenant-b')}-expense`), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id(`${id('tenant-b')}-cash`), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    }));

    const result = await accountingService.processEvent(purchase(id('tenant-a'), id('evt-cross-account')));
    expect(result.error).toContain('Account tenant mismatch');
    expect(result.evaluation.reason).toBe('ACCOUNT_INVALID');
    expect(result.postedJournal).toBeUndefined();
  });

  it('preserves tenantId through generate, post, persistence, and reversal', async () => {
    const result = await accountingService.processEvent(purchase(id('tenant-a'), id('evt-tenant-a')));
    expect(result.error).toBeUndefined();
    expect(result.journal?.tenantId).toBe(id('tenant-a'));
    expect(result.postedJournal?.tenantId).toBe(id('tenant-a'));

    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const stored = await accountingService.getPostedJournal(postedId, id('tenant-a'));
    expect(stored?.tenantId).toBe(id('tenant-a'));

    const reversal = await accountingService.reverseJournal(postedId, 'correction', id('tenant-a'));
    expect(reversal.success).toBe(true);
    const reversalId = reversal.reversalJournalId;
    expect(reversalId).not.toBeNull();
    if (!reversalId) {
      return;
    }
    const reversalJournal = await accountingService.getPostedJournal(reversalId, id('tenant-a'));
    expect(reversalJournal?.tenantId).toBe(id('tenant-a'));
  });

  it('does not return tenant A journals to tenant B', async () => {
    const result = await accountingService.processEvent(purchase(id('tenant-a'), id('evt-hidden')));
    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const leaked = await accountingService.getPostedJournal(postedId, id('tenant-b'));
    expect(leaked).toBeNull();
  });

  it('does not treat the same event id as idempotent across tenants', async () => {
    const sharedEventId = id('shared-event');
    const first = await accountingService.processEvent(purchase(id('tenant-a'), sharedEventId));
    const second = await accountingService.processEvent(purchase(id('tenant-b'), sharedEventId));

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(first.postedJournal?.id).not.toBe(second.postedJournal?.id);
    expect(first.postedJournal?.tenantId).toBe(id('tenant-a'));
    expect(second.postedJournal?.tenantId).toBe(id('tenant-b'));
  });

  it('does not let tenant B reverse tenant A journal', async () => {
    const result = await accountingService.processEvent(purchase(id('tenant-a'), id('evt-reverse-cross')));
    const postedId = result.postedJournal?.id;
    expect(postedId).toBeDefined();
    if (postedId === undefined) {
      return;
    }

    const reversal = await accountingService.reverseJournal(postedId, 'steal', id('tenant-b'));
    expect(reversal.success).toBe(false);
    expect(reversal.message).toBe('Journal not found');

    const original = await accountingService.getPostedJournal(postedId, id('tenant-a'));
    expect(original?.status).toBe('POSTED');
  });
});
