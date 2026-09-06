import { Account } from '../../domain/accounting/Account';
import { BusinessEvent } from '../../domain/events/BusinessEvent';
import { PolicyLifecycleError } from '../../domain/policies/PolicyLifecycle';
import { PolicyVersion, PolicyVersionStatus } from '../../domain/policies/PolicyVersion';
import { SimulationResult } from '../../domain/policies/SimulationResult';
import { LLMProvider } from '../ai/LLMContract';
import { LLMGateway } from '../ai/LLMGateway';
import { AccountingService } from '../accounting/AccountingService';
import { PolicyAuthoringService } from '../policies/PolicyAuthoringService';
import { PolicyDslService } from '../policies/PolicyDslService';
import { PolicyLifecycleService } from '../policies/PolicyLifecycleService';
import { InMemoryAccountRepository } from '../../infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../infrastructure/memory/InMemoryJournalRepository';
import { InMemoryPolicyVersionRepository } from '../../infrastructure/memory/InMemoryPolicyVersionRepository';
import { createLLMProviderFromEnv } from '../../infrastructure/ai/createLLMProvider';
import {
  createPlaygroundAccounts,
  createPlaygroundSampleEvents,
  DEFAULT_INSTRUCTION,
  DEMO_MEALS_DSL,
  playgroundAccountMap,
  PLAYGROUND_TENANT_ID,
  PlaygroundSampleEvent
} from './demoData';
import { inspectAuthoringIntent } from './inspectAuthoringIntent';
import {
  PlaygroundAction,
  PlaygroundAuthoringStatus,
  PlaygroundLedgerEntryView,
  PlaygroundLineView,
  PlaygroundSnapshot
} from './PlaygroundSnapshot';

export class PlaygroundService {
  private readonly tenantId = PLAYGROUND_TENANT_ID;
  private readonly accounts: Account[];
  private readonly sampleEvents: PlaygroundSampleEvent[];
  private readonly accountById: Map<string, Account>;
  private readonly accountRepo: InMemoryAccountRepository;
  private readonly journalRepo: InMemoryJournalRepository;
  private readonly policyRepo: InMemoryPolicyVersionRepository;
  private readonly dsl: PolicyDslService;
  private readonly authoring: PolicyAuthoringService;
  private readonly lifecycle: PolicyLifecycleService;
  private readonly accounting: AccountingService;
  private readonly providerName: string;

  private instruction = DEFAULT_INSTRUCTION;
  private dslText = '';
  private authoringStatus: PlaygroundAuthoringStatus = 'IDLE';
  private policyVersion: PolicyVersion | null = null;
  private clarificationNeeds: string[] = [];
  private unsupportedReason: string | null = null;
  private error: string | null = null;
  private validation: PlaygroundSnapshot['validation'] = null;
  private simulation: PlaygroundSnapshot['simulation'] = null;
  private ledger: PlaygroundSnapshot['ledger'] = null;

  private constructor(provider: LLMProvider) {
    this.accounts = createPlaygroundAccounts();
    this.sampleEvents = createPlaygroundSampleEvents();
    this.accountById = new Map(this.accounts.map((account) => [account.id, account]));
    this.accountRepo = new InMemoryAccountRepository();
    this.journalRepo = new InMemoryJournalRepository();
    this.policyRepo = new InMemoryPolicyVersionRepository();
    for (const account of this.accounts) {
      this.accountRepo.add(account);
    }

    this.dsl = new PolicyDslService();
    this.authoring = new PolicyAuthoringService(new LLMGateway(provider));
    this.lifecycle = new PolicyLifecycleService({
      accountRepository: this.accountRepo,
      journalRepository: this.journalRepo
    });
    this.accounting = new AccountingService({
      policyVersionRepository: this.policyRepo,
      accountRepository: this.accountRepo,
      journalRepository: this.journalRepo
    });
    this.providerName = provider.name;
  }

  static createDemo(provider?: LLMProvider): PlaygroundService {
    const resolved = provider ?? createLLMProviderFromEnv(process.env, {
      fakeHandler: () => DEMO_MEALS_DSL
    });
    return new PlaygroundService(resolved);
  }

  snapshot(): PlaygroundSnapshot {
    return {
      instruction: this.instruction,
      dsl: this.dslText,
      authoringStatus: this.authoringStatus,
      policyStatus: this.policyVersion?.status ?? null,
      provider: this.providerName,
      clarificationNeeds: [...this.clarificationNeeds],
      unsupportedReason: this.unsupportedReason,
      error: this.error,
      validation: this.validation,
      simulation: this.simulation,
      ledger: this.ledger,
      accounts: this.accounts.map((account) => ({ code: account.code, name: account.name })),
      sampleEvents: this.sampleEvents.map((sample) => ({
        id: sample.event.id,
        label: sample.label,
        amount: sample.event.amount ?? 0,
        counterparty: sample.event.counterparty ?? ''
      })),
      allowedActions: this.allowedActions()
    };
  }

  async author(instruction: string): Promise<PlaygroundSnapshot> {
    this.resetDownstream();
    this.instruction = instruction;
    const intent = inspectAuthoringIntent(instruction);
    if (intent.kind === 'NEEDS_CLARIFICATION') {
      this.authoringStatus = 'NEEDS_CLARIFICATION';
      this.clarificationNeeds = intent.needs;
      this.dslText = '';
      this.policyVersion = null;
      return this.snapshot();
    }
    if (intent.kind === 'UNSUPPORTED') {
      this.authoringStatus = 'UNSUPPORTED';
      this.unsupportedReason = intent.reason;
      this.dslText = '';
      this.policyVersion = null;
      return this.snapshot();
    }

    const result = await this.authoring.author({
      instruction,
      tenantId: this.tenantId,
      accounts: playgroundAccountMap(this.accounts),
      chartOfAccounts: this.accounts.map((account) => ({ code: account.code, name: account.name }))
    });

    if (result.status === 'REJECTED') {
      this.authoringStatus = 'REJECTED';
      this.dslText = result.dsl;
      this.policyVersion = null;
      this.error = result.error;
      return this.snapshot();
    }

    this.authoringStatus = 'COMPILED';
    this.dslText = result.dsl;
    this.policyVersion = result.policyVersion;
    return this.snapshot();
  }

  replaceDsl(dsl: string): PlaygroundSnapshot {
    this.resetDownstream();
    this.dslText = dsl;
    try {
      this.policyVersion = this.dsl.compile(dsl, {
        tenantId: this.tenantId,
        accounts: playgroundAccountMap(this.accounts),
        status: 'DRAFT',
        createdAt: new Date(0)
      });
      this.authoringStatus = 'COMPILED';
    } catch (error) {
      this.policyVersion = null;
      this.authoringStatus = 'REJECTED';
      this.error = error instanceof Error ? error.message : String(error);
    }
    return this.snapshot();
  }

  async validate(): Promise<PlaygroundSnapshot> {
    if (this.policyVersion === null) {
      this.error = 'Compile a valid policy before validating.';
      return this.snapshot();
    }
    const result = await this.lifecycle.validate(this.policyVersion, this.tenantId);
    this.validation = {
      valid: result.validation.valid,
      issues: result.validation.issues.map((issue) => ({ code: issue.code, message: issue.message }))
    };
    if (!result.validation.valid) {
      this.error = 'Validation failed.';
      return this.snapshot();
    }
    this.policyVersion = result.policyVersion;
    this.error = null;
    return this.snapshot();
  }

  async simulate(): Promise<PlaygroundSnapshot> {
    if (this.policyVersion === null || this.policyVersion.status !== 'VALIDATED') {
      this.error = 'Validate the policy before simulating.';
      return this.snapshot();
    }
    const postedBefore = (await this.journalRepo.findByTenantId(this.tenantId)).length;
    const simulation = await this.lifecycle.simulate(
      this.policyVersion,
      this.sampleEvents.map((sample) => sample.event)
    );
    const postedAfter = (await this.journalRepo.findByTenantId(this.tenantId)).length;
    this.simulation = this.viewSimulation(simulation, postedAfter > postedBefore);
    try {
      this.policyVersion = await this.lifecycle.completeSimulation(
        this.policyVersion,
        simulation,
        this.tenantId
      );
      this.error = null;
    } catch (error) {
      this.error = error instanceof PolicyLifecycleError || error instanceof Error
        ? error.message
        : String(error);
    }
    return this.snapshot();
  }

  async approve(): Promise<PlaygroundSnapshot> {
    if (this.policyVersion === null) {
      this.error = 'No policy to approve.';
      return this.snapshot();
    }
    try {
      this.policyVersion = await this.lifecycle.approve(this.policyVersion, this.tenantId);
      this.error = null;
    } catch (error) {
      this.error = error instanceof PolicyLifecycleError || error instanceof Error
        ? error.message
        : String(error);
    }
    return this.snapshot();
  }

  async activate(): Promise<PlaygroundSnapshot> {
    if (this.policyVersion === null) {
      this.error = 'No policy to activate.';
      return this.snapshot();
    }
    try {
      this.policyVersion = await this.lifecycle.activate(this.policyVersion, this.tenantId);
      this.policyRepo.add(this.policyVersion);
      this.error = null;
    } catch (error) {
      this.error = error instanceof PolicyLifecycleError || error instanceof Error
        ? error.message
        : String(error);
    }
    return this.snapshot();
  }

  async processEvents(): Promise<PlaygroundSnapshot> {
    if (this.policyVersion === null || this.policyVersion.status !== 'ACTIVE') {
      this.error = 'Activate the policy before processing events.';
      return this.snapshot();
    }
    this.policyRepo.add(this.policyVersion);
    const entries: PlaygroundLedgerEntryView[] = [];
    for (const sample of this.sampleEvents) {
      entries.push(await this.processOne(sample));
    }
    this.ledger = {
      entries,
      postedCount: entries.filter((entry) => entry.posted).length
    };
    this.error = null;
    return this.snapshot();
  }

  reset(): PlaygroundSnapshot {
    this.instruction = DEFAULT_INSTRUCTION;
    this.dslText = '';
    this.authoringStatus = 'IDLE';
    this.policyVersion = null;
    this.resetDownstream();
    return this.snapshot();
  }

  private async processOne(sample: PlaygroundSampleEvent): Promise<PlaygroundLedgerEntryView> {
    const result = await this.accounting.processEvent(sample.event);
    const posted = result.postedJournal;
    if (posted === undefined) {
      return {
        eventId: sample.event.id,
        label: sample.label,
        posted: false,
        reason: result.evaluation.reason,
        lines: [],
        totalDebits: 0,
        totalCredits: 0,
        balanced: true,
        ...(result.error !== undefined ? { error: result.error } : {})
      };
    }
    const lines = posted.lines.map((line) => this.viewLine(line.accountId, line.debit, line.credit));
    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
    return {
      eventId: sample.event.id,
      label: sample.label,
      posted: true,
      status: posted.status,
      reason: result.evaluation.reason,
      lines,
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits
    };
  }

  private viewSimulation(simulation: SimulationResult, didPost: boolean): PlaygroundSnapshot['simulation'] {
    const events = simulation.events.map((eventResult) => {
      const sample = this.sampleEvents.find((candidate) => candidate.event.id === eventResult.eventId);
      const lines = (eventResult.journalPreview?.lines ?? []).map((line) =>
        this.viewLine(line.accountId, line.debit, line.credit)
      );
      return {
        eventId: eventResult.eventId,
        label: sample?.label ?? eventResult.eventId,
        matched: eventResult.matched,
        reason: eventResult.reason,
        wouldPost: eventResult.wouldPost,
        selectedRuleId: eventResult.selectedRuleId,
        lines,
        totalDebits: eventResult.journalPreview?.totalDebits ?? 0,
        totalCredits: eventResult.journalPreview?.totalCredits ?? 0,
        ...(eventResult.error !== undefined ? { error: eventResult.error } : {})
      };
    });
    return {
      didPost,
      events,
      totalDebits: events.reduce((sum, eventResult) => sum + eventResult.totalDebits, 0),
      totalCredits: events.reduce((sum, eventResult) => sum + eventResult.totalCredits, 0)
    };
  }

  private viewLine(accountId: string, debit: number, credit: number): PlaygroundLineView {
    const account = this.accountById.get(accountId);
    return {
      accountCode: account?.code ?? accountId,
      accountName: account?.name ?? 'Unknown account',
      debit,
      credit
    };
  }

  private resetDownstream(): void {
    this.clarificationNeeds = [];
    this.unsupportedReason = null;
    this.error = null;
    this.validation = null;
    this.simulation = null;
    this.ledger = null;
    this.journalRepo.clear();
    this.policyRepo.clear();
  }

  private allowedActions(): PlaygroundAction[] {
    const actions: PlaygroundAction[] = ['reset', 'author'];
    const status: PolicyVersionStatus | null = this.policyVersion?.status ?? null;
    if (this.authoringStatus === 'IDLE') {
      return actions;
    }
    if (this.authoringStatus === 'NEEDS_CLARIFICATION' || this.authoringStatus === 'UNSUPPORTED') {
      return actions;
    }
    actions.push('replaceDsl');
    if (this.authoringStatus === 'REJECTED' || this.policyVersion === null) {
      return actions;
    }
    if (status === 'AI_GENERATED' || status === 'DRAFT') {
      actions.push('validate');
      return actions;
    }
    if (status === 'VALIDATED') {
      actions.push('simulate');
      return actions;
    }
    if (status === 'SIMULATED') {
      actions.push('approve');
      return actions;
    }
    if (status === 'APPROVED') {
      actions.push('activate');
      return actions;
    }
    if (status === 'ACTIVE') {
      actions.push('process');
    }
    return actions;
  }
}

export function isPlaygroundAction(value: string): value is PlaygroundAction {
  return value === 'author'
    || value === 'replaceDsl'
    || value === 'validate'
    || value === 'simulate'
    || value === 'approve'
    || value === 'activate'
    || value === 'process'
    || value === 'reset';
}
