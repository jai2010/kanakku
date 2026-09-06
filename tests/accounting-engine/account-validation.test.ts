import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { Journal } from '../../src/domain/accounting/Journal';
import { PolicyVersion } from '../../src/domain/policies/PolicyVersion';

describe('Accounting Engine - Account Validation (Production)', () => {
  let accountingEngine: AccountingEngineService;
  let accountRepository: InMemoryAccountRepository;
  let journalRepository: InMemoryJournalRepository;

  beforeEach(() => {
    accountRepository = new InMemoryAccountRepository();
    journalRepository = new InMemoryJournalRepository();
    accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository,
        journalRepository
      }
    });
  });

  afterEach(() => {
    accountRepository.clear();
    journalRepository.clear();
  });

  function addAccount(params: {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    type: 'ASSET' | 'LIABILITY' | 'EXPENSE' | 'INCOME' | 'EQUITY';
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const account = createAccount({
      id: params.id,
      tenantId: params.tenantId,
      code: params.code,
      name: params.name,
      type: params.type,
      status: params.status ?? 'ACTIVE'
    });
    accountRepository.add(account);
    return account;
  }

  function purchaseEvent(tenantId: string) {
    return createBusinessEvent({
      id: id('evt-account-validation'),
      tenantId,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 1000,
      currency: 'USD',
      attributes: {}
    });
  }

  function policyUsing(debitAccountId: string, creditAccountId: string): PolicyVersion {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-account-validation'),
      policyId: id('pol-account-validation'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-account-validation'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: debitAccountId, side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: creditAccountId, side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });
  }

  function handBuiltJournal(debitAccountId: string, creditAccountId: string, tenantId: string): Journal {
    return {
      id: id('journal-account-validation'),
      tenantId,
      businessEventId: id('evt-account-validation'),
      accountingTransactionId: id('txn-account-validation'),
      transactionDate: new Date('2026-09-03'),
      currency: 'USD',
      description: 'Account validation journal',
      lines: [
        {
          id: id('line-1'),
          journalId: id('journal-account-validation'),
          accountId: debitAccountId,
          debit: 1000,
          credit: 0,
          currency: 'USD'
        },
        {
          id: id('line-2'),
          journalId: id('journal-account-validation'),
          accountId: creditAccountId,
          debit: 0,
          credit: 1000,
          currency: 'USD'
        }
      ],
      status: 'DRAFT',
      createdAt: new Date('2026-09-03')
    };
  }

  it('accepts existing ACTIVE accounts during generateJournal and validateJournal', async () => {
    addAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    });
    addAccount({
      id: id('acc-5000'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE'
    });

    const journal = await accountingEngine.generateJournal(
      purchaseEvent(id('tenant-1')),
      policyUsing(id('acc-5000'), id('acc-1000'))
    );

    expect(journal.lines).toHaveLength(2);

    const validation = await accountingEngine.validateJournal(journal);
    expect(validation.valid).toBe(true);
  });

  it('generateJournal throws when an account does not exist', async () => {
    addAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    });

    await expect(
      accountingEngine.generateJournal(
        purchaseEvent(id('tenant-1')),
        policyUsing(id('acc-missing'), id('acc-1000'))
      )
    ).rejects.toThrow(`Account not found: ${id('acc-missing')}`);
  });

  it('validateJournal returns ACCOUNT_NOT_FOUND for a missing account', async () => {
    addAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    });

    const validation = await accountingEngine.validateJournal(
      handBuiltJournal(id('acc-missing'), id('acc-1000'), id('tenant-1'))
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('ACCOUNT_NOT_FOUND');
    expect(validation.accountId).toBe(id('acc-missing'));
  });

  it('generateJournal throws when an account is INACTIVE', async () => {
    addAccount({
      id: id('acc-9999'),
      tenantId: id('tenant-1'),
      code: '9999',
      name: 'Old Cash Account',
      type: 'ASSET',
      status: 'INACTIVE'
    });
    addAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    });

    await expect(
      accountingEngine.generateJournal(
        purchaseEvent(id('tenant-1')),
        policyUsing(id('acc-9999'), id('acc-1000'))
      )
    ).rejects.toThrow(`Account is not active: ${id('acc-9999')}`);
  });

  it('validateJournal returns ACCOUNT_INACTIVE for an inactive account', async () => {
    addAccount({
      id: id('acc-9999'),
      tenantId: id('tenant-1'),
      code: '9999',
      name: 'Old Cash Account',
      type: 'ASSET',
      status: 'INACTIVE'
    });
    addAccount({
      id: id('acc-1000'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
    });

    const validation = await accountingEngine.validateJournal(
      handBuiltJournal(id('acc-9999'), id('acc-1000'), id('tenant-1'))
    );

    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('ACCOUNT_INACTIVE');
    expect(validation.accountId).toBe(id('acc-9999'));
  });

  it('generateJournal rejects a cross-tenant account', async () => {
    addAccount({
      id: id('acc-8888'),
      tenantId: id('tenant-2'),
      code: '8888',
      name: 'Foreign Cash',
      type: 'ASSET'
    });
    addAccount({
      id: id('acc-5000'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE'
    });

    await expect(
      accountingEngine.generateJournal(
        purchaseEvent(id('tenant-1')),
        policyUsing(id('acc-5000'), id('acc-8888'))
      )
    ).rejects.toThrow('Account tenant mismatch');
  });

  it('validateJournal rejects a cross-tenant account', async () => {
    addAccount({
      id: id('acc-8888'),
      tenantId: id('tenant-2'),
      code: '8888',
      name: 'Foreign Cash',
      type: 'ASSET'
    });
    addAccount({
      id: id('acc-5000'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE'
    });

    const validation = await accountingEngine.validateJournal(
      handBuiltJournal(id('acc-5000'), id('acc-8888'), id('tenant-1'))
    );
    expect(validation.valid).toBe(false);
    expect(validation.reason).toBe('ACCOUNT_TENANT_MISMATCH');
    expect(validation.accountId).toBe(id('acc-8888'));
  });
});
