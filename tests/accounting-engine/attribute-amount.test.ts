import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { BusinessEvent } from '../../src/domain/events/BusinessEvent';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('Accounting Engine — ATTRIBUTE_AMOUNT', () => {
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

    accountRepository.add(createAccount({
      id: id('acc-tax'),
      tenantId: id('tenant-1'),
      code: '1800',
      name: 'Tax Receivable',
      type: 'ASSET',
      status: 'ACTIVE'
    }));
    accountRepository.add(createAccount({
      id: id('acc-payable'),
      tenantId: id('tenant-1'),
      code: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));
  });

  afterEach(() => {
    accountRepository.clear();
    journalRepository.clear();
  });

  function eventWithAttributes(attributes: BusinessEvent['attributes']) {
    return createBusinessEvent({
      id: id('evt-attribute-amount'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 8200,
      currency: 'INR',
      counterparty: 'Supplier ABC',
      attributes,
      source: 'API'
    });
  }

  function policyWithDebitAmount(amount: AmountExpression) {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-attribute-amount'),
      policyId: id('pol-attribute-amount'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-attribute-amount'),
            priority: 100,
            when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-tax'), side: 'DEBIT', amount, description: 'Tax' },
                  {
                    accountId: id('acc-payable'),
                    side: 'CREDIT',
                    amount: { type: 'EVENT_AMOUNT' },
                    description: 'Payable'
                  }
                ]
              }
            }
          }
        ]
      }
    });
  }

  it('uses the attribute value rather than event.amount', async () => {
    const journal = await accountingEngine.generateJournal(
      eventWithAttributes({ taxAmount: 1000 }),
      policyWithDebitAmount({ type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' })
    );

    const taxLine = journal.lines.find((line) => line.accountId === id('acc-tax'));
    expect(taxLine?.debit).toBe(1000);
    expect(taxLine?.credit).toBe(0);
  });

  it('fails closed when the attribute is missing', async () => {
    await expect(
      accountingEngine.generateJournal(
        eventWithAttributes({}),
        policyWithDebitAmount({ type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' })
      )
    ).rejects.toThrow('ATTRIBUTE_AMOUNT failed closed');
  });

  it('fails closed when the attribute is non-numeric', async () => {
    await expect(
      accountingEngine.generateJournal(
        eventWithAttributes({ taxAmount: '1000' }),
        policyWithDebitAmount({ type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' })
      )
    ).rejects.toThrow('ATTRIBUTE_AMOUNT failed closed');
  });

  it('fails closed when the attribute is non-finite', async () => {
    await expect(
      accountingEngine.generateJournal(
        eventWithAttributes({ taxAmount: Number.POSITIVE_INFINITY }),
        policyWithDebitAmount({ type: 'ATTRIBUTE_AMOUNT', attribute: 'taxAmount' })
      )
    ).rejects.toThrow('ATTRIBUTE_AMOUNT failed closed');
  });
});
