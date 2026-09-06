import { id } from '../fixtures/ids';
import { LLMGateway } from '../../src/application/ai/LLMGateway';
import { PolicyAuthoringService } from '../../src/application/policies/PolicyAuthoringService';
import { SUTRA_POLICY_AUTHORING_PROMPT } from '../../src/application/policies/policyAuthoringPrompt';
import { PolicyLifecycleService } from '../../src/application/policies/PolicyLifecycleService';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { FakeLLMProvider } from '../../src/infrastructure/ai/FakeLLMProvider';
import { InMemoryAccountRepository } from '../../src/infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../src/infrastructure/memory/InMemoryJournalRepository';
import { createAccount } from '../../src/domain/accounting/Account';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { BUSINESS_MEALS_DSL } from '../policy-dsl/fixtures';

const TENANT_ID = id('authoring-tenant');
const ACCOUNT_5220 = id('authoring-5220');
const ACCOUNT_2000 = id('authoring-2000');
const ACCOUNTS = new Map([
  ['5220', ACCOUNT_5220],
  ['2000', ACCOUNT_2000]
]);

const INSTRUCTION = 'Starbucks purchases over 5000 should debit meals 5220 and credit payable 2000 from 2026-01-01.';

function authoringService(text: string): { service: PolicyAuthoringService; fake: FakeLLMProvider } {
  const fake = new FakeLLMProvider({ text });
  return { service: new PolicyAuthoringService(new LLMGateway(fake)), fake };
}

describe('PolicyAuthoringService', () => {
  it('compiles untrusted model text through the DSL parser into AI_GENERATED PolicyIR', async () => {
    const { service, fake } = authoringService(BUSINESS_MEALS_DSL);
    const result = await service.author({
      instruction: INSTRUCTION,
      tenantId: TENANT_ID,
      accounts: ACCOUNTS,
      chartOfAccounts: [
        { code: '5220', name: 'Business Meals' },
        { code: '2000', name: 'Payable' }
      ]
    });

    expect(result.status).toBe('COMPILED');
    if (result.status !== 'COMPILED') {
      throw new Error('expected compiled policy');
    }
    expect(result.policyVersion.status).toBe('AI_GENERATED');
    expect(result.policyVersion.definition.rules).toHaveLength(1);
    expect(result.policyVersion.definition.rules[0]?.then.treatment.lines).toEqual([
      expect.objectContaining({ accountId: ACCOUNT_5220, side: 'DEBIT' }),
      expect.objectContaining({ accountId: ACCOUNT_2000, side: 'CREDIT' })
    ]);
    expect(fake.lastRequest?.systemInstruction).toBe(SUTRA_POLICY_AUTHORING_PROMPT);
    expect(fake.lastRequest?.userInput).toContain(INSTRUCTION);
    expect(fake.lastRequest?.userInput).toContain('5220 (Business Meals)');
  });

  it('rejects invalid model output at the DSL boundary and does not invent PolicyIR', async () => {
    const { service } = authoringService('I think you should debit cash maybe?');
    const result = await service.author({
      instruction: INSTRUCTION,
      tenantId: TENANT_ID,
      accounts: ACCOUNTS
    });
    expect(result.status).toBe('REJECTED');
    if (result.status !== 'REJECTED') {
      throw new Error('expected rejection');
    }
    expect(result.error.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('policyVersion');
  });

  it('produces the same PolicyIR when two providers emit the same DSL', async () => {
    const first = await new PolicyAuthoringService(new LLMGateway(new FakeLLMProvider({ text: BUSINESS_MEALS_DSL, model: 'grok' })))
      .author({ instruction: INSTRUCTION, tenantId: TENANT_ID, accounts: ACCOUNTS });
    const second = await new PolicyAuthoringService(new LLMGateway(new FakeLLMProvider({ text: BUSINESS_MEALS_DSL, model: 'deepseek' })))
      .author({ instruction: INSTRUCTION, tenantId: TENANT_ID, accounts: ACCOUNTS });

    expect(first.status).toBe('COMPILED');
    expect(second.status).toBe('COMPILED');
    if (first.status !== 'COMPILED' || second.status !== 'COMPILED') {
      throw new Error('expected both to compile');
    }
    expect(first.policyVersion.definition).toEqual(second.policyVersion.definition);
    expect(first.policyVersion.id).toBe(second.policyVersion.id);
  });

  it('does not activate or post; AI_GENERATED cannot execute until the lifecycle runs', async () => {
    const journals = new InMemoryJournalRepository();
    const accounts = new InMemoryAccountRepository();
    accounts.add(createAccount({
      id: ACCOUNT_5220,
      tenantId: TENANT_ID,
      code: '5220',
      name: 'Meals',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));
    accounts.add(createAccount({
      id: ACCOUNT_2000,
      tenantId: TENANT_ID,
      code: '2000',
      name: 'Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));

    const authored = await new PolicyAuthoringService(new LLMGateway(new FakeLLMProvider({ text: BUSINESS_MEALS_DSL })))
      .author({ instruction: INSTRUCTION, tenantId: TENANT_ID, accounts: ACCOUNTS });
    expect(authored.status).toBe('COMPILED');
    if (authored.status !== 'COMPILED') {
      throw new Error('expected compiled policy');
    }

    const engine = new PolicyEngineService();
    expect(engine.evaluate(createBusinessEvent({
      id: id('authoring-event'),
      tenantId: TENANT_ID,
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 7800,
      currency: 'INR',
      counterparty: 'Starbucks',
      attributes: {}
    }), authored.policyVersion).reason).toBe('POLICY_NOT_ACTIVE');

    const lifecycle = new PolicyLifecycleService({
      accountRepository: accounts,
      journalRepository: journals
    });
    const validated = await lifecycle.validate(authored.policyVersion, TENANT_ID);
    expect(validated.policyVersion.status).toBe('VALIDATED');
    expect(await journals.findByTenantId(TENANT_ID)).toEqual([]);
  });

  it('still compiles when the model wraps DSL in a fence', async () => {
    const { service } = authoringService('Here you go:\n```\n' + BUSINESS_MEALS_DSL + '\n```\n');
    const result = await service.author({
      instruction: INSTRUCTION,
      tenantId: TENANT_ID,
      accounts: ACCOUNTS
    });
    expect(result.status).toBe('COMPILED');
  });
});
