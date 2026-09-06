import { id } from '../fixtures/ids';
import { AccountingEngineService } from '../../src/application/accounting/AccountingEngineService';
import { PolicyLifecycleService } from '../../src/application/policies/PolicyLifecycleService';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { createPolicyVersion, PolicyVersion, PolicyVersionStatus } from '../../src/domain/policies/PolicyVersion';
import { PostedJournal } from '../../src/domain/accounting/PostedJournal';
import { Rule } from '../../src/domain/policies/PolicyIR';

export const TENANT_ID = id('lifecycle-tenant');
export const OTHER_TENANT_ID = id('lifecycle-other-tenant');
export const EXPENSE_ID = id('lifecycle-acc-expense');
export const CASH_ID = id('lifecycle-acc-cash');
export const PAYABLE_ID = id('lifecycle-acc-payable');

export class RecordingJournalRepository extends InMemoryJournalRepository {
  postedSaves = 0;

  async savePostedJournal(postedJournal: PostedJournal): Promise<void> {
    this.postedSaves += 1;
    return super.savePostedJournal(postedJournal);
  }
}

export function twoLineTreatment(debitAccountId: string, creditAccountId: string) {
  return {
    lines: [
      { accountId: debitAccountId, side: 'DEBIT' as const, amount: { type: 'EVENT_AMOUNT' as const } },
      { accountId: creditAccountId, side: 'CREDIT' as const, amount: { type: 'EVENT_AMOUNT' as const } }
    ]
  };
}

export function purchaseRule(ruleId: string, creditAccountId: string, priority = 100): Rule {
  return {
    id: ruleId,
    priority,
    when: { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
    then: { treatment: twoLineTreatment(EXPENSE_ID, creditAccountId) }
  };
}

export function policyVersion(params: {
  id?: string;
  status?: PolicyVersionStatus;
  rules?: Rule[];
  tenantId?: string;
  version?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
}): PolicyVersion {
  return createPolicyVersion({
    id: params.id ?? id('lifecycle-pv'),
    policyId: id('lifecycle-policy'),
    tenantId: params.tenantId ?? TENANT_ID,
    version: params.version ?? 1,
    effectiveFrom: params.effectiveFrom ?? new Date('2026-01-01'),
    effectiveTo: params.effectiveTo,
    status: params.status ?? 'DRAFT',
    definition: {
      rules: params.rules ?? [purchaseRule(id('lifecycle-rule'), CASH_ID)]
    }
  });
}

export function purchaseEvent(eventId: string, amount = 1000) {
  return createBusinessEvent({
    id: eventId,
    tenantId: TENANT_ID,
    eventType: 'PURCHASE',
    occurredAt: new Date('2026-09-03'),
    amount,
    currency: 'USD',
    attributes: {}
  });
}

export function refundEvent(eventId: string) {
  return createBusinessEvent({
    id: eventId,
    tenantId: TENANT_ID,
    eventType: 'REFUND',
    occurredAt: new Date('2026-09-03'),
    amount: 100,
    currency: 'USD',
    attributes: {}
  });
}

export function seedAccounts(accountRepository: InMemoryAccountRepository): void {
  accountRepository.add(createAccount({
    id: EXPENSE_ID,
    tenantId: TENANT_ID,
    code: '5000',
    name: 'Expense',
    type: 'EXPENSE',
    status: 'ACTIVE'
  }));
  accountRepository.add(createAccount({
    id: CASH_ID,
    tenantId: TENANT_ID,
    code: '1000',
    name: 'Cash',
    type: 'ASSET',
    status: 'ACTIVE'
  }));
  accountRepository.add(createAccount({
    id: PAYABLE_ID,
    tenantId: TENANT_ID,
    code: '2000',
    name: 'Payable',
    type: 'LIABILITY',
    status: 'ACTIVE'
  }));
}

export function createLifecycleHarness(): {
  accounts: InMemoryAccountRepository;
  journals: RecordingJournalRepository;
  lifecycle: PolicyLifecycleService;
  accountingEngine: AccountingEngineService;
} {
  const accounts = new InMemoryAccountRepository();
  const journals = new RecordingJournalRepository();
  seedAccounts(accounts);
  const lifecycle = new PolicyLifecycleService({
    accountRepository: accounts,
    journalRepository: journals
  });
  const accountingEngine = new AccountingEngineService({
    dependencies: {
      accountRepository: accounts,
      journalRepository: journals
    }
  });
  return { accounts, journals, lifecycle, accountingEngine };
}
