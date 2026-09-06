import { Account, AccountType, createAccount } from '../../domain/accounting/Account';
import { BusinessEvent, EventType, createBusinessEvent } from '../../domain/events/BusinessEvent';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { AccountingService } from '../accounting/AccountingService';
import { LedgerService } from '../accounting/LedgerService';
import { projectTransaction } from '../accounting/projectTransaction';
import { rateUsage } from '../../domain/events/rateUsage';
import { PolicyDslService } from '../policies/PolicyDslService';
import { PolicyLifecycleService } from '../policies/PolicyLifecycleService';
import { InMemoryAccountRepository } from '../../infrastructure/memory/InMemoryAccountRepository';
import { InMemoryJournalRepository } from '../../infrastructure/memory/InMemoryJournalRepository';
import { InMemoryPolicyVersionRepository } from '../../infrastructure/memory/InMemoryPolicyVersionRepository';
import {
  ENGINE_DEMO_RUNS,
  ENGINE_EXAMPLES,
  ENGINE_PARTICIPANTS,
  ENGINE_RULES,
  ENGINE_TENANT_ID,
  EngineAmountType,
  EngineCondition,
  EngineExampleSeed,
  EngineRuleSeed,
  EngineTreatmentLineSeed,
  createEngineAccounts,
  engineAccountMap,
  engineId,
  formatCondition,
  participantByName,
  renderEngineDsl,
  treatmentLinesFor
} from './engineDemo';
import {
  EngineAccountBalanceView,
  EngineAccountLedgerView,
  EngineAccountType,
  EngineBalanceImpactView,
  EngineExampleView,
  EngineLedgerEntryView,
  EngineLedgerTotalsView,
  EngineLineView,
  EngineParticipantKind,
  EngineParticipantLedgerView,
  EngineParticipantView,
  EnginePolicyView,
  EngineProcessResult,
  EngineRuleView,
  EngineSimulationView,
  EngineSnapshot,
  EngineStageView,
  EngineTransactionalResultView,
  EngineTransactionView,
  EngineTrialBalanceView,
  EngineUsageView
} from './EngineSnapshot';
import {
  ParticipantAccount,
  TransactionalEntry,
  TransactionalTreatment,
  composeEventEffects,
  createParticipantAccount,
  deriveBalance,
  materializeTransactionalEntries,
  participantIdFromEvent,
  runningLedger,
  signedDelta
} from '../../domain/transactional';

type LiveRule = EngineRuleSeed & {
  enabled: boolean;
  builtin: boolean;
  kernelId: string | null;
  lines: EngineTreatmentLineSeed[];
};

type LiveExample = EngineExampleSeed;

const DEMO_EPOCH = new Date('2026-09-05T10:00:00.000Z');

type EventMeta = {
  merchant: string;
  amount: number;
  type: EngineExampleView['type'];
  category: string;
  selectedRule: string | null;
};

export class EngineService {
  private readonly tenantId = ENGINE_TENANT_ID;
  private readonly accounts: Account[];
  private readonly accountById: Map<string, Account>;
  private readonly accountByCode: Map<string, Account>;
  private readonly accountRepo: InMemoryAccountRepository;
  private readonly journalRepo: InMemoryJournalRepository;
  private readonly policyRepo: InMemoryPolicyVersionRepository;
  private readonly dsl: PolicyDslService;
  private readonly accounting: AccountingService;
  private readonly ledgerService: LedgerService;

  private rules: LiveRule[];
  private examples: LiveExample[];
  private policyVersion: PolicyVersion | null = null;
  private dslVersion = 1;
  private journalSeq = 0;
  private txSeq = 0;
  private displayIds = new Map<string, string>();
  private txDisplayIds = new Map<string, string>();
  private transactions: EngineTransactionView[] = [];
  private eventMeta = new Map<string, EventMeta>();
  private resultsByEventId = new Map<string, EngineProcessResult>();
  private accountBalances: EngineAccountBalanceView[] = [];
  private accountLedgers: EngineAccountLedgerView[] = [];
  private trialBalance: EngineTrialBalanceView;
  private ledgerTotals: EngineLedgerTotalsView;
  private postedJournalViews: EngineLedgerEntryView[] = [];
  private lastResult: EngineProcessResult | null = null;
  private lastSimulation: EngineSimulationView | null = null;
  private lastCompiledDsl = '';
  private lifecycle: PolicyLifecycleService;
  private durations: number[] = [];
  private errorCount = 0;
  private demoAt = new Date(DEMO_EPOCH);
  private seeded = false;
  private participants: ParticipantAccount[] = [];
  private transactionalEntries: TransactionalEntry[] = [];

  private constructor() {
    this.accounts = createEngineAccounts();
    this.accountById = new Map(this.accounts.map((account) => [account.id, account]));
    this.accountByCode = new Map(this.accounts.map((account) => [account.code, account]));
    this.accountRepo = new InMemoryAccountRepository();
    this.journalRepo = new InMemoryJournalRepository();
    this.policyRepo = new InMemoryPolicyVersionRepository();
    for (const account of this.accounts) {
      this.accountRepo.add(account);
    }
    this.participants = ENGINE_PARTICIPANTS.map((row) => createParticipantAccount({
      id: engineId(`party-${row.kind}-${row.participantId}`),
      tenantId: this.tenantId,
      participantId: row.participantId,
      kind: row.kind,
      name: row.name,
      currency: 'INR',
      createdAt: new Date(0)
    }));
    this.dsl = new PolicyDslService();
    this.accounting = new AccountingService({
      policyVersionRepository: this.policyRepo,
      accountRepository: this.accountRepo,
      journalRepository: this.journalRepo
    });
    this.ledgerService = new LedgerService({
      accountRepository: this.accountRepo,
      journalRepository: this.journalRepo
    });
    this.lifecycle = new PolicyLifecycleService({
      accountRepository: this.accountRepo,
      journalRepository: this.journalRepo
    });
    this.rules = ENGINE_RULES.map((rule) => seedLiveRule(rule, true));
    this.examples = ENGINE_EXAMPLES.map((example) => ({ ...example }));
    const empty = emptyGeneralLedger(this.accounts);
    this.accountBalances = empty.accountBalances;
    this.accountLedgers = empty.accountLedgers;
    this.trialBalance = empty.trialBalance;
    this.ledgerTotals = empty.ledgerTotals;
    this.rebuildPolicy();
  }

  static createLive(): EngineService {
    return new EngineService();
  }

  snapshot(): EngineSnapshot {
    const posted = this.postedJournalViews.filter((entry) => entry.posted);
    const balanced = posted.filter((entry) => entry.balanced).length;
    const avgMs = this.durations.length === 0
      ? 0
      : this.durations.reduce((sum, value) => sum + value, 0) / this.durations.length;
    return {
      rules: this.viewRules(),
      examples: this.examples.map(viewExample),
      accounts: this.accounts.map((account) => ({
        code: account.code,
        name: account.name,
        type: account.type,
        parentCode: account.parentId === undefined ? null : (this.accountById.get(account.parentId)?.code ?? null),
        currency: account.currency ?? 'INR'
      })),
      transactions: [...this.transactions],
      participants: this.viewParticipants(),
      participantLedgers: this.viewParticipantLedgers(),
      ledger: [...this.postedJournalViews],
      accountBalances: [...this.accountBalances],
      accountLedgers: this.accountLedgers.map((ledger) => ({ ...ledger, entries: [...ledger.entries] })),
      trialBalance: { ...this.trialBalance, lines: [...this.trialBalance.lines] },
      ledgerTotals: { ...this.ledgerTotals, typeTotals: [...this.ledgerTotals.typeTotals] },
      metrics: {
        rules: this.rules.filter((rule) => rule.enabled).length,
        avgMs,
        balancedPct: posted.length === 0 ? 100 : Math.round((balanced / posted.length) * 100),
        errors: this.errorCount,
        posted: posted.length
      },
      lastResult: this.lastResult,
      policy: this.viewPolicy(),
      lastSimulation: this.lastSimulation
    };
  }

  async seedDemo(): Promise<EngineSnapshot> {
    if (this.seeded) {
      return this.snapshot();
    }
    this.seeded = true;
    let heroEventId: string | null = null;
    for (const run of ENGINE_DEMO_RUNS) {
      await this.process({
        merchant: run.merchant,
        amount: run.amount,
        type: run.type,
        category: run.category,
        mark: run.mark,
        tint: run.tint,
        remember: false,
        ...(run.usage !== undefined ? { usage: run.usage } : {}),
        ...(run.attributes !== undefined ? { attributes: run.attributes } : {})
      });
      if (run.merchant === 'Acme Electronics' && run.type === 'MARKETPLACE_SALE') {
        heroEventId = this.lastResult?.eventId ?? null;
      }
    }
    if (heroEventId !== null) {
      this.replay(heroEventId);
    }
    return this.snapshot();
  }

  async process(input: {
    merchant: string;
    amount: number;
    type: EventType;
    category?: string;
    mark?: string;
    tint?: string;
    remember?: boolean;
    usage?: EngineUsageView;
    attributes?: Record<string, unknown>;
  }): Promise<EngineSnapshot> {
    const merchant = input.merchant.trim() || 'New Merchant';
    const type = input.type;
    const known = ENGINE_EXAMPLES.find((example) =>
      example.merchant === merchant
      && example.type === type
      && (input.category === undefined || example.category === input.category)
    ) ?? ENGINE_EXAMPLES.find((example) => example.merchant === merchant && example.type === type);
    const category = input.category?.trim() || known?.category || typeLabel(type);
    const mark = input.mark ?? known?.mark ?? initials(merchant);
    const tint = input.tint ?? known?.tint ?? '#3b82f6';
    const usage = input.usage ?? known?.usage;
    const amount = usage !== undefined
      ? rateUsage(usage.quantity, usage.unitPrice)
      : (Number.isFinite(input.amount) ? Math.abs(input.amount) : 0);

    if (input.remember !== false && !this.examples.some((example) => example.merchant === merchant && example.amount === amount && example.type === type && example.category === category)) {
      this.examples.unshift({
        key: `custom-${Date.now()}`,
        merchant,
        amount,
        type,
        category,
        mark,
        tint,
        ...(usage !== undefined ? { usage } : {})
      });
    }

    const attributes: Record<string, unknown> = {
      category,
      description: `${merchant} ${category}`,
      ...(known?.attributes ?? {}),
      ...(input.attributes ?? {})
    };
    if (usage !== undefined) {
      attributes.meter = usage.meter;
      attributes.quantity = usage.quantity;
      attributes.unitPrice = usage.unitPrice;
      attributes.unit = usage.unit;
    }
    this.ensureParticipantAttributes(type, merchant, attributes);

    const event = createBusinessEvent({
      id: engineId(`evt-${Date.now()}-${Math.random()}`),
      tenantId: this.tenantId,
      eventType: type,
      occurredAt: this.nextOccurredAt(),
      amount,
      currency: 'INR',
      counterparty: merchant,
      attributes,
      source: 'API'
    });

    const started = Date.now();
    const result = await this.accounting.processEvent(event);
    const kernelMs = Date.now() - started;
    this.durations.push(kernelMs);
    if (this.durations.length > 24) {
      this.durations.shift();
    }

    const selected = this.ruleByKernelId(result.evaluation.selectedRuleId);
    const transactional = this.applyTransactional(event, selected);
    const posted = result.postedJournal;
    const lines = posted === undefined
      ? []
      : posted.lines.map((line) => this.viewLine(line.accountId, line.debit, line.credit));
    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
    const balanced = posted !== undefined && totalDebits === totalCredits;
    const error = result.error ?? null;
    if (error !== null || posted === undefined) {
      this.errorCount += 1;
    }

    const displayId = posted === undefined ? null : this.nextJournalDisplayId(posted.id);
    const processResult: EngineProcessResult = {
      eventId: event.id,
      merchant,
      amount,
      type,
      category,
      mark,
      tint,
      evaluation: {
        matched: result.evaluation.matched,
        reason: result.evaluation.reason,
        selectedRule: selected === undefined ? null : this.viewRule(selected),
        rulesScanned: this.rules.filter((rule) => rule.enabled).length
      },
      journal: posted === undefined || displayId === null
        ? null
        : {
          id: posted.id,
          displayId,
          lines,
          totalDebits,
          totalCredits,
          balanced,
          posted: true,
          kernelMs
        },
      stages: this.buildStages({
        matched: result.evaluation.matched,
        selected,
        lines,
        balanced,
        posted: posted !== undefined,
        displayId,
        kernelMs,
        error,
        transactional
      }),
      log: this.buildLog({
        merchant,
        amount,
        type,
        matched: result.evaluation.matched,
        selected,
        lines,
        balanced,
        posted: posted !== undefined,
        displayId,
        error,
        transactional
      }),
      error,
      balanceImpact: [],
      transactional
    };

    this.eventMeta.set(event.id, {
      merchant,
      amount,
      type,
      category,
      selectedRule: selected === undefined ? null : displayRuleId(selected.priority)
    });
    await this.refreshGeneralLedger();
    if (posted !== undefined) {
      processResult.balanceImpact = await this.viewBalanceImpact(posted.id);
    }
    this.lastResult = processResult;
    this.resultsByEventId.set(event.id, processResult);
    this.transactions.unshift(this.viewCapturedTransaction({
      event,
      journal: posted,
      matched: result.evaluation.matched,
      selectedRuleId: result.evaluation.selectedRuleId,
      error: result.error ?? null,
      selected,
      lines,
      transactional
    }));
    return this.snapshot();
  }

  replay(eventId: string): EngineSnapshot {
    const stored = this.resultsByEventId.get(eventId);
    if (stored !== undefined) {
      this.lastResult = stored;
    }
    return this.snapshot();
  }

  addRule(input: {
    name?: string;
    merchant: string;
    debitCode?: string;
    creditCode?: string;
    minAmount?: number;
    type?: EventType;
    lines?: EngineTreatmentLineSeed[];
    transactional?: TransactionalTreatment;
  }): EngineSnapshot {
    const merchant = input.merchant.trim();
    const name = input.name?.trim() || (merchant.length > 0 ? `${merchant} Rule` : 'New transformation');
    if (merchant.length === 0 && input.type === undefined && (input.lines === undefined || input.lines.length < 2)) {
      return this.snapshot();
    }
    const existing = this.rules.find((rule) => rule.name.toLowerCase() === name.toLowerCase());
    if (existing !== undefined && existing.enabled) {
      existing.priority = Math.max(existing.priority, this.nextPriority());
      this.rebuildPolicy();
      return this.snapshot();
    }
    const debitCode = input.debitCode ?? '5000';
    const creditCode = input.creditCode ?? '1010';
    if (!this.accountByCode.has(debitCode) || !this.accountByCode.has(creditCode)) {
      return this.snapshot();
    }
    const type: EventType = input.type ?? 'PURCHASE';
    const conditions: EngineCondition[] = [
      { field: 'eventType', op: '=', value: type }
    ];
    if (merchant.length > 0) {
      conditions.push({ field: 'counterparty', op: '=', value: merchant });
    }
    if (input.minAmount !== undefined && Number.isFinite(input.minAmount) && input.minAmount > 0) {
      conditions.push({ field: 'amount', op: '>', value: input.minAmount });
    }
    this.rules.unshift(seedLiveRule({
      name,
      priority: this.nextPriority(),
      conditions,
      debitCode,
      creditCode,
      ...(input.lines !== undefined && input.lines.length >= 2 ? { lines: input.lines } : {}),
      ...(input.transactional !== undefined ? { transactional: input.transactional } : {})
    }, false));
    this.rebuildPolicy();
    return this.snapshot();
  }

  addAccount(input: {
    name: string;
    code: string;
    type: AccountType;
    parentCode?: string;
    currency?: string;
  }): EngineSnapshot {
    const code = input.code.trim();
    const name = input.name.trim();
    if (code.length === 0 || name.length === 0) {
      return this.snapshot();
    }
    if (this.accountByCode.has(code)) {
      return this.snapshot();
    }
    const parent = input.parentCode === undefined || input.parentCode.length === 0
      ? undefined
      : this.accountByCode.get(input.parentCode);
    const currency = (input.currency ?? 'INR').trim().toUpperCase();
    const account = createAccount({
      id: engineId(`acc-${code}`),
      tenantId: this.tenantId,
      code,
      name,
      type: input.type,
      ...(parent !== undefined ? { parentId: parent.id } : {}),
      ...(currency.length === 3 ? { currency } : {}),
      status: 'ACTIVE'
    });
    this.accounts.push(account);
    this.accountById.set(account.id, account);
    this.accountByCode.set(account.code, account);
    this.accountRepo.add(account);
    const blank = emptyGeneralLedger([account]);
    this.accountBalances = [...this.accountBalances, ...blank.accountBalances]
      .sort((left, right) => left.code.localeCompare(right.code));
    this.accountLedgers = [...this.accountLedgers, ...blank.accountLedgers]
      .sort((left, right) => left.code.localeCompare(right.code));
    this.ledgerTotals = { ...this.ledgerTotals, accountCount: this.accounts.length };
    return this.snapshot();
  }

  updateAccount(input: { code: string; name?: string; type?: AccountType }): EngineSnapshot {
    const current = this.accountByCode.get(input.code);
    if (current === undefined) {
      return this.snapshot();
    }
    const next = {
      ...current,
      name: input.name?.trim() || current.name,
      type: input.type ?? current.type
    };
    const index = this.accounts.findIndex((account) => account.id === current.id);
    if (index >= 0) {
      this.accounts[index] = next;
    }
    this.accountById.set(next.id, next);
    this.accountByCode.set(next.code, next);
    this.accountRepo.add(next);
    this.accountBalances = this.accountBalances.map((row) =>
      row.accountId === next.id ? { ...row, name: next.name, type: next.type } : row
    );
    this.accountLedgers = this.accountLedgers.map((row) =>
      row.accountId === next.id ? { ...row, name: next.name, type: next.type } : row
    );
    return this.snapshot();
  }

  addCondition(input: {
    ruleId: string;
    field: string;
    op: EngineCondition['op'];
    value: EngineCondition['value'];
  }): EngineSnapshot {
    const rule = this.findRule(input.ruleId);
    if (rule === undefined) {
      return this.snapshot();
    }
    const field = input.field.trim();
    if (field.length === 0) {
      return this.snapshot();
    }
    const next: EngineCondition = { field, op: input.op, value: input.value };
    const duplicate = rule.conditions.some((condition) =>
      condition.field === field
      && condition.op === input.op
      && JSON.stringify(condition.value) === JSON.stringify(input.value)
    );
    if (duplicate) {
      return this.snapshot();
    }
    const existing = rule.conditions.findIndex((condition) => condition.field === field && field === 'eventType');
    if (existing >= 0) {
      rule.conditions[existing] = next;
    } else {
      rule.conditions.push(next);
    }
    this.rebuildPolicy();
    return this.snapshot();
  }

  addTreatmentLine(input: {
    ruleId: string;
    side: 'DEBIT' | 'CREDIT';
    accountCode: string;
    amountType?: EngineAmountType;
  }): EngineSnapshot {
    const rule = this.findRule(input.ruleId);
    if (rule === undefined || !this.accountByCode.has(input.accountCode)) {
      return this.snapshot();
    }
    rule.lines.push({
      side: input.side,
      accountCode: input.accountCode,
      amountType: input.amountType ?? 'EVENT_AMOUNT'
    });
    const debit = rule.lines.find((line) => line.side === 'DEBIT');
    const credit = rule.lines.find((line) => line.side === 'CREDIT');
    if (debit !== undefined) {
      rule.debitCode = debit.accountCode;
    }
    if (credit !== undefined) {
      rule.creditCode = credit.accountCode;
    }
    this.rebuildPolicy();
    return this.snapshot();
  }

  async simulate(input: { ruleId: string; eventId?: string }): Promise<EngineSnapshot> {
    const intended = this.findRule(input.ruleId);
    if (intended === undefined) {
      this.lastSimulation = null;
      return this.snapshot();
    }
    const fromTransaction = input.eventId === undefined
      ? undefined
      : this.transactions.find((row) => row.eventId === input.eventId);
    const source = fromTransaction === undefined ? 'conditions' : 'transaction';
    const built = fromTransaction === undefined
      ? this.synthesizeFromRule(intended)
      : {
        merchant: fromTransaction.counterparty,
        amount: fromTransaction.amount,
        type: fromTransaction.type,
        category: fromTransaction.category
      };
    const event = createBusinessEvent({
      id: fromTransaction?.eventId ?? engineId(`sim-${Date.now()}-${intended.priority}`),
      tenantId: this.tenantId,
      eventType: built.type,
      occurredAt: fromTransaction === undefined ? new Date('2026-09-05T10:00:00.000Z') : new Date(fromTransaction.occurredAt),
      amount: built.amount,
      currency: fromTransaction?.currency ?? 'INR',
      counterparty: built.merchant,
      attributes: {
        category: built.category,
        description: `${built.merchant} ${built.category}`
      },
      source: 'API'
    });
    if (this.policyVersion === null) {
      this.lastSimulation = {
        source,
        eventId: fromTransaction?.eventId ?? null,
        merchant: built.merchant,
        amount: built.amount,
        type: built.type,
        matched: false,
        reason: 'POLICY_NOT_FOUND',
        selectedRuleDisplayId: null,
        selectedRuleName: null,
        intendedRuleDisplayId: displayRuleId(intended.priority),
        conditionsSatisfied: false,
        accountsResolved: false,
        balanced: false,
        wouldPost: false,
        lines: [],
        totalDebits: 0,
        totalCredits: 0,
        error: 'No active policy is compiled.'
      };
      return this.snapshot();
    }
    const result = await this.lifecycle.simulate(this.policyVersion, [event]);
    const one = result.events[0];
    const selected = one === undefined ? undefined : this.ruleByKernelId(one.selectedRuleId ?? undefined);
    const lines = (one?.journalPreview?.lines ?? []).map((line) => this.viewLine(line.accountId, line.debit, line.credit));
    const totalDebits = one?.journalPreview?.totalDebits ?? 0;
    const totalCredits = one?.journalPreview?.totalCredits ?? 0;
    const intendedId = displayRuleId(intended.priority);
    const selectedId = selected === undefined ? null : displayRuleId(selected.priority);
    this.lastSimulation = {
      source,
      eventId: fromTransaction?.eventId ?? null,
      merchant: built.merchant,
      amount: built.amount,
      type: built.type,
      matched: one?.matched === true,
      reason: one?.reason ?? 'NO_MATCHING_RULE',
      selectedRuleDisplayId: selectedId,
      selectedRuleName: selected?.name ?? null,
      intendedRuleDisplayId: intendedId,
      conditionsSatisfied: selectedId === intendedId,
      accountsResolved: lines.length >= 2,
      balanced: one?.journalPreview?.balanced === true,
      wouldPost: one?.wouldPost === true,
      lines,
      totalDebits,
      totalCredits,
      error: one?.error ?? null
    };
    return this.snapshot();
  }

  toggleRule(ruleId: string): EngineSnapshot {
    const rule = this.rules.find((candidate) => candidate.kernelId === ruleId || displayRuleId(candidate.priority) === ruleId);
    if (rule === undefined) {
      return this.snapshot();
    }
    const enabledCount = this.rules.filter((candidate) => candidate.enabled).length;
    if (rule.enabled && enabledCount <= 1) {
      return this.snapshot();
    }
    rule.enabled = !rule.enabled;
    this.rebuildPolicy();
    return this.snapshot();
  }

  reset(): EngineSnapshot {
    this.journalRepo.clear();
    this.rules = ENGINE_RULES.map((rule) => seedLiveRule(rule, true));
    this.examples = ENGINE_EXAMPLES.map((example) => ({ ...example }));
    this.lastResult = null;
    this.lastSimulation = null;
    this.lastCompiledDsl = '';
    this.durations = [];
    this.errorCount = 0;
    this.journalSeq = 0;
    this.txSeq = 0;
    this.displayIds = new Map();
    this.txDisplayIds = new Map();
    this.transactions = [];
    this.eventMeta = new Map();
    this.resultsByEventId = new Map();
    this.transactionalEntries = [];
    this.seeded = false;
    this.participants = ENGINE_PARTICIPANTS.map((row) => createParticipantAccount({
      id: engineId(`party-${row.kind}-${row.participantId}`),
      tenantId: this.tenantId,
      participantId: row.participantId,
      kind: row.kind,
      name: row.name,
      currency: 'INR',
      createdAt: new Date(0)
    }));
    const empty = emptyGeneralLedger(this.accounts);
    this.accountBalances = empty.accountBalances;
    this.accountLedgers = empty.accountLedgers;
    this.trialBalance = empty.trialBalance;
    this.ledgerTotals = empty.ledgerTotals;
    this.postedJournalViews = [];
    this.demoAt = new Date(DEMO_EPOCH);
    this.dslVersion = 1;
    this.rebuildPolicy();
    return this.snapshot();
  }

  private rebuildPolicy(): void {
    const enabled = this.rules.filter((rule) => rule.enabled);
    this.policyRepo.clear();
    if (enabled.length === 0) {
      this.policyVersion = null;
      return;
    }
    this.dslVersion += 1;
    const dsl = renderEngineDsl(
      enabled.map((rule) => ({
        ...rule,
        lines: rule.lines,
        debitName: this.accountByCode.get(rule.debitCode)?.name ?? rule.debitCode,
        creditName: this.accountByCode.get(rule.creditCode)?.name ?? rule.creditCode
      })),
      this.dslVersion
    );
    this.lastCompiledDsl = dsl;
    this.policyVersion = this.dsl.compile(dsl, {
      tenantId: this.tenantId,
      accounts: engineAccountMap(this.accounts),
      status: 'ACTIVE',
      createdAt: new Date(0)
    });
    this.policyRepo.add(this.policyVersion);
    enabled.forEach((rule, index) => {
      rule.kernelId = this.policyVersion?.definition.rules[index]?.id ?? null;
    });
  }

  private viewRules(): EngineRuleView[] {
    return [...this.rules]
      .sort((left, right) => right.priority - left.priority)
      .map((rule) => this.viewRule(rule));
  }

  private viewRule(rule: LiveRule): EngineRuleView {
    const debit = this.accountByCode.get(rule.debitCode);
    const credit = this.accountByCode.get(rule.creditCode);
    const lines = treatmentLinesFor(rule).map((line) => {
      const account = this.accountByCode.get(line.accountCode);
      return {
        side: line.side,
        accountCode: line.accountCode,
        accountName: account?.name ?? line.accountCode,
        accountType: (account?.type ?? 'EXPENSE') as EngineAccountType,
        amountType: line.amountType,
        amountLabel: amountLabelFor(line),
        description: line.description ?? null
      };
    });
    return {
      id: rule.kernelId ?? displayRuleId(rule.priority),
      displayId: displayRuleId(rule.priority),
      name: rule.name,
      conditions: rule.conditions.map(formatCondition),
      conditionDetails: rule.conditions.map((condition) => ({
        field: condition.field,
        op: condition.op,
        value: Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value)
      })),
      lines,
      debitCode: rule.debitCode,
      debitName: debit?.name ?? rule.debitCode,
      creditCode: rule.creditCode,
      creditName: credit?.name ?? rule.creditCode,
      activity: activityOf(rule),
      priority: rule.priority,
      enabled: rule.enabled,
      builtin: rule.builtin,
      transactional: rule.transactional === undefined
        ? null
        : {
          participantKind: rule.transactional.participantKind,
          participantField: rule.transactional.participantField,
          effects: rule.transactional.effects.map((effect) => ({
            type: effect.type,
            direction: effect.direction,
            amountLabel: transactionalAmountLabel(effect.amount),
            description: effect.description
          }))
        }
    };
  }

  private viewPolicy(): EnginePolicyView | null {
    if (this.policyVersion === null) {
      return null;
    }
    return {
      name: 'SUTRA Live Engine',
      version: this.policyVersion.version,
      status: 'ACTIVE',
      effectiveFrom: this.policyVersion.effectiveFrom.toISOString(),
      dsl: this.lastCompiledDsl,
      transformationCount: this.rules.filter((rule) => rule.enabled).length
    };
  }

  private findRule(ruleId: string): LiveRule | undefined {
    return this.rules.find((candidate) =>
      candidate.kernelId === ruleId || displayRuleId(candidate.priority) === ruleId
    );
  }

  private synthesizeFromRule(rule: LiveRule): {
    merchant: string;
    amount: number;
    type: EventType;
    category: string;
  } {
    const type = activityOf(rule) ?? 'PURCHASE';
    const counterparty = rule.conditions.find((condition) => condition.field === 'counterparty');
    let merchant = rule.name;
    if (counterparty !== undefined) {
      if (Array.isArray(counterparty.value) && counterparty.value[0] !== undefined) {
        merchant = String(counterparty.value[0]);
      } else if (!Array.isArray(counterparty.value)) {
        merchant = String(counterparty.value);
      }
    }
    let amount = 100;
    const amountCondition = rule.conditions.find((condition) => condition.field === 'amount');
    if (amountCondition !== undefined && typeof amountCondition.value === 'number') {
      if (amountCondition.op === '>') {
        amount = amountCondition.value + 1;
      } else if (amountCondition.op === '>=') {
        amount = amountCondition.value;
      } else if (amountCondition.op === '<') {
        amount = Math.max(1, amountCondition.value - 1);
      } else if (amountCondition.op === '<=') {
        amount = amountCondition.value;
      } else {
        amount = amountCondition.value;
      }
    }
    return { merchant, amount, type, category: rule.name };
  }

  private viewLine(accountId: string, debit: number, credit: number): EngineLineView {
    const account = this.accountById.get(accountId);
    return {
      accountCode: account?.code ?? accountId,
      accountName: account?.name ?? 'Unknown account',
      debit,
      credit
    };
  }

  private ruleByKernelId(id: string | undefined): LiveRule | undefined {
    if (id === undefined) {
      return undefined;
    }
    return this.rules.find((rule) => rule.kernelId === id);
  }

  private nextPriority(): number {
    const max = this.rules.reduce((highest, rule) => Math.max(highest, rule.priority), 0);
    return max + 10;
  }

  private nextOccurredAt(): Date {
    const at = new Date(this.demoAt);
    this.demoAt = new Date(this.demoAt.getTime() + 4 * 60 * 60 * 1000);
    return at;
  }

  private nextTransactionDisplayId(eventId: string): string {
    const existing = this.txDisplayIds.get(eventId);
    if (existing !== undefined) {
      return existing;
    }
    this.txSeq += 1;
    const displayId = `TX-2026-${String(this.txSeq).padStart(6, '0')}`;
    this.txDisplayIds.set(eventId, displayId);
    return displayId;
  }

  private viewCapturedTransaction(input: {
    event: BusinessEvent;
    journal: import('../../domain/accounting/PostedJournal').PostedJournal | undefined;
    matched: boolean;
    selectedRuleId?: string;
    error: string | null;
    selected: LiveRule | undefined;
    lines: EngineLineView[];
    transactional: EngineTransactionalResultView | null;
  }): EngineTransactionView {
    const projection = projectTransaction({
      event: input.event,
      journal: input.journal,
      matched: input.matched,
      selectedRuleId: input.selectedRuleId,
      error: input.error
    });
    const selected = input.selected === undefined ? null : this.viewRule(input.selected);
    return {
      eventId: projection.eventId,
      displayId: this.nextTransactionDisplayId(projection.eventId),
      occurredAt: projection.occurredAt.toISOString(),
      source: input.event.counterparty ?? projection.source,
      type: projection.transactionType,
      counterparty: projection.counterparty ?? '',
      category: typeof input.event.attributes.category === 'string' ? input.event.attributes.category : projection.description,
      description: projection.description,
      amount: projection.amount ?? 0,
      currency: projection.currency ?? 'INR',
      usage: projection.usage === undefined
        ? null
        : {
          meter: projection.usage.meter,
          quantity: projection.usage.quantity,
          unitPrice: projection.usage.unitPrice,
          unit: projection.usage.unit ?? 'units'
        },
      accountingStatus: projection.accountingStatus,
      pipeline: {
        ...projection.pipeline,
        tracked: input.transactional !== null
      },
      journalId: projection.journalId ?? null,
      journalDisplayId: projection.journalId !== undefined ? this.nextJournalDisplayId(projection.journalId) : null,
      selectedRule: selected?.displayId ?? null,
      selectedRuleName: selected?.name ?? null,
      accountCodes: input.lines.map((line) => line.accountCode),
      participantId: input.transactional?.participantId ?? participantIdFromAttributes(input.event),
      participantKind: input.transactional?.participantKind ?? null,
      participantName: input.transactional?.participantName ?? null,
      orderId: typeof input.event.attributes.orderId === 'string' ? input.event.attributes.orderId : null,
      tracked: input.transactional !== null,
      effects: input.transactional?.effects ?? [],
      composition: input.transactional?.composition ?? null
    };
  }

  private nextJournalDisplayId(journalId: string): string {
    const existing = this.displayIds.get(journalId);
    if (existing !== undefined) {
      return existing;
    }
    this.journalSeq += 1;
    const displayId = `JN-2026-${String(this.journalSeq).padStart(6, '0')}`;
    this.displayIds.set(journalId, displayId);
    return displayId;
  }

  private async refreshGeneralLedger(): Promise<void> {
    const query = { tenantId: this.tenantId, functionalCurrency: 'INR' as const };
    const [balances, journals, trial, totals] = await Promise.all([
      this.ledgerService.getAccountBalances(query),
      this.ledgerService.getPostedJournals(this.tenantId),
      this.ledgerService.getTrialBalance(query),
      this.ledgerService.getLedgerTotals(query)
    ]);
    const accountById = this.accountById;
    this.accountBalances = balances.map((balance) => {
      const account = accountById.get(balance.accountId);
      return {
        accountId: balance.accountId,
        code: account?.code ?? balance.accountId,
        name: account?.name ?? 'Unknown account',
        type: account?.type ?? 'EXPENSE',
        currency: balance.currency,
        totalDebits: balance.totalDebits,
        totalCredits: balance.totalCredits,
        balance: balance.balance,
        balanceSide: balance.balanceSide,
        entryCount: 0
      };
    });
    const ledgers: EngineAccountLedgerView[] = [];
    for (const balance of this.accountBalances) {
      const accountLedger = await this.ledgerService.getAccountLedger(this.tenantId, balance.accountId, balance.currency);
      if (accountLedger === null) {
        continue;
      }
      ledgers.push({
        accountId: accountLedger.account.id,
        code: accountLedger.account.code,
        name: accountLedger.account.name,
        type: accountLedger.account.type,
        currency: accountLedger.currency,
        totalDebits: accountLedger.totalDebits,
        totalCredits: accountLedger.totalCredits,
        balance: accountLedger.balance,
        balanceSide: accountLedger.balanceSide,
        entries: accountLedger.entries.map((entry) => {
          const meta = this.eventMeta.get(entry.businessEventId);
          return {
            id: entry.id,
            journalId: entry.journalId,
            journalDisplayId: this.nextJournalDisplayId(entry.journalId),
            eventId: entry.businessEventId,
            transactionDate: entry.transactionDate.toISOString(),
            postedAt: entry.postedAt.toISOString(),
            description: meta?.merchant ?? entry.description,
            merchant: meta?.merchant ?? entry.description,
            debit: entry.debit,
            credit: entry.credit,
            currency: entry.currency,
            runningBalance: entry.runningBalance,
            runningBalanceSide: entry.runningBalanceSide,
            selectedRule: meta?.selectedRule ?? null,
            journalStatus: entry.journalStatus
          };
        })
      });
    }
    this.accountLedgers = ledgers;
    const countByAccount = new Map(ledgers.map((ledger) => [ledger.accountId, ledger.entries.length]));
    this.accountBalances = this.accountBalances.map((balance) => ({
      ...balance,
      entryCount: countByAccount.get(balance.accountId) ?? 0
    }));
    this.trialBalance = {
      asOf: trial.asOf.toISOString(),
      currency: trial.currency,
      lines: trial.lines.map((line) => {
        const account = accountById.get(line.accountId);
        return {
          accountId: line.accountId,
          code: account?.code ?? line.accountId,
          name: account?.name ?? 'Unknown account',
          type: account?.type ?? 'EXPENSE',
          debit: line.debit,
          credit: line.credit
        };
      }),
      totalDebits: trial.totalDebits,
      totalCredits: trial.totalCredits,
      balanced: trial.balanced
    };
    this.ledgerTotals = {
      accountCount: totals.accountCount,
      totalDebits: totals.totalDebits,
      totalCredits: totals.totalCredits,
      balanced: totals.balanced,
      asOf: totals.asOf.toISOString(),
      from: totals.from?.toISOString() ?? null,
      to: totals.to?.toISOString() ?? null,
      typeTotals: totals.typeTotals
    };
    this.postedJournalViews = journals.map((journal) => {
      const meta = this.eventMeta.get(journal.businessEventId);
      const lines = journal.lines.map((line) => this.viewLine(line.accountId, line.debit, line.credit));
      const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
      return {
        eventId: journal.businessEventId,
        transactionDisplayId: this.txDisplayIds.get(journal.businessEventId) ?? null,
        journalId: journal.id,
        journalDisplayId: this.nextJournalDisplayId(journal.id),
        merchant: meta?.merchant ?? journal.description,
        amount: meta?.amount ?? Math.max(totalDebits, totalCredits),
        type: meta?.type ?? 'PURCHASE',
        category: meta?.category ?? 'Posted',
        posted: journal.status === 'POSTED' || journal.status === 'REVERSED',
        balanced: totalDebits === totalCredits,
        selectedRule: meta?.selectedRule ?? null,
        lines,
        totalDebits,
        totalCredits,
        postedAt: journal.postedAt.toISOString(),
        transactionDate: journal.transactionDate.toISOString(),
        description: journal.description,
        status: journal.status === 'REVERSED' ? 'REVERSED' : 'POSTED'
      };
    });
  }

  private async viewBalanceImpact(journalId: string): Promise<EngineBalanceImpactView[]> {
    const impact = await this.ledgerService.getJournalBalanceImpact(this.tenantId, journalId);
    return impact.map((row) => {
      const account = this.accountById.get(row.accountId);
      return {
        accountId: row.accountId,
        accountCode: account?.code ?? row.accountId,
        accountName: account?.name ?? 'Unknown account',
        accountType: account?.type ?? 'EXPENSE',
        currency: row.currency,
        debit: row.debit,
        credit: row.credit,
        previousBalance: row.previousBalance,
        previousBalanceSide: row.previousBalanceSide,
        nextBalance: row.nextBalance,
        nextBalanceSide: row.nextBalanceSide
      };
    });
  }

  private buildStages(input: {
    matched: boolean;
    selected: LiveRule | undefined;
    lines: EngineLineView[];
    balanced: boolean;
    posted: boolean;
    displayId: string | null;
    kernelMs: number;
    error: string | null;
    transactional: EngineTransactionalResultView | null;
  }): EngineStageView[] {
    const selectedView = input.selected === undefined ? null : this.viewRule(input.selected);
    const transactional = input.transactional;
    return [
      {
        id: 'policy',
        kicker: 'POLICY',
        title: 'RESOLVER',
        headline: '1',
        detail: 'active policy',
        tone: 'ok'
      },
      {
        id: 'rules',
        kicker: 'RULE',
        title: 'EVALUATION',
        headline: selectedView === null ? 'No match' : selectedView.displayId,
        detail: selectedView === null ? 'default path' : 'matched',
        tone: selectedView === null ? 'warn' : 'ok'
      },
      {
        id: 'accounts',
        kicker: 'EFFECT',
        title: 'TRANSACTIONAL',
        headline: transactional === null
          ? 'Financial only'
          : formatSigned(transactional.composition.total),
        detail: transactional === null
          ? 'no operational balance'
          : `${transactional.participantName} · ${transactional.effects.length} entries`,
        tone: 'ok'
      },
      {
        id: 'journal',
        kicker: 'JOURNAL',
        title: 'ACCOUNTING',
        headline: String(input.lines.length),
        detail: input.lines.length === 1 ? 'journal line' : 'journal lines',
        tone: input.lines.length >= 2 ? 'ok' : 'warn'
      },
      {
        id: 'validator',
        kicker: 'VALIDATOR',
        title: 'BALANCE',
        headline: input.balanced ? 'Balanced' : 'Check',
        detail: input.balanced ? 'DR = CR' : (input.error ?? 'not balanced'),
        tone: input.balanced ? 'ok' : 'warn'
      },
      {
        id: 'ledger',
        kicker: 'LEDGER',
        title: 'POSTING',
        headline: input.posted ? 'Posted' : 'Held',
        detail: input.posted ? `in ${Math.max(input.kernelMs, 1)}ms` : (input.error ?? 'not posted'),
        tone: input.posted ? 'ok' : 'warn'
      }
    ];
  }

  private buildLog(input: {
    merchant: string;
    amount: number;
    type: EventType;
    matched: boolean;
    selected: LiveRule | undefined;
    lines: EngineLineView[];
    balanced: boolean;
    posted: boolean;
    displayId: string | null;
    error: string | null;
    transactional: EngineTransactionalResultView | null;
  }): Array<{ title: string; detail: string; tone: 'ok' | 'warn' }> {
    const selected = input.selected === undefined ? null : this.viewRule(input.selected);
    const debit = input.lines.find((line) => line.debit > 0);
    const credit = input.lines.find((line) => line.credit > 0);
    const rows: Array<{ title: string; detail: string; tone: 'ok' | 'warn' }> = [
      {
        title: 'Transaction received',
        detail: `${input.merchant} · ${formatRupee(input.amount, input.type)} · ${typeLabel(input.type)}`,
        tone: 'ok'
      },
      {
        title: `${this.rules.filter((rule) => rule.enabled).length} rules scanned`,
        detail: 'Active SUTRA Live Engine policy',
        tone: 'ok'
      },
      {
        title: input.matched && selected !== null ? 'Evaluating rules' : 'No matching rule',
        detail: selected === null
          ? (input.error ?? 'No treatment selected')
          : `${selected.displayId} matched (priority ${selected.priority})`,
        tone: selected === null ? 'warn' : 'ok'
      }
    ];
    if (input.transactional !== null) {
      rows.push({
        title: `${input.transactional.participantKind === 'SELLER' ? 'Seller' : 'Buyer'} account updated`,
        detail: `${input.transactional.participantName} · ${formatSigned(input.transactional.composition.total)} · balance ${formatSigned(input.transactional.balanceAfter)}`,
        tone: 'ok'
      });
    }
    if (debit !== undefined && credit !== undefined) {
      rows.push({
        title: 'Accounting effect',
        detail: `DR ${debit.accountCode} · CR ${credit.accountCode}`,
        tone: 'ok'
      });
      rows.push({
        title: 'Journal built',
        detail: `${input.lines.length} lines`,
        tone: 'ok'
      });
    }
    rows.push({
      title: input.balanced ? 'Validation passed' : 'Validation held',
      detail: input.balanced ? 'Balanced (DR = CR)' : (input.error ?? 'Unbalanced'),
      tone: input.balanced ? 'ok' : 'warn'
    });
    rows.push({
      title: input.posted ? 'Posted to ledger' : 'Not posted',
      detail: input.posted && input.displayId !== null ? `Journal ID: ${input.displayId}` : (input.error ?? 'Held in engine'),
      tone: input.posted ? 'ok' : 'warn'
    });
    return rows;
  }

  private applyTransactional(event: BusinessEvent, selected: LiveRule | undefined): EngineTransactionalResultView | null {
    const treatment = selected?.transactional;
    if (treatment === undefined) {
      return null;
    }
    const participantId = participantIdFromEvent(event, treatment.participantField);
    if (participantId === null) {
      return null;
    }
    const account = this.ensureParticipantAccount(treatment.participantKind, participantId, event.counterparty ?? participantId);
    const created = materializeTransactionalEntries({ event, account, treatment });
    this.transactionalEntries.push(...created);
    const accountEntries = this.transactionalEntries.filter((entry) => entry.accountId === account.id);
    const eventEntries = created;
    const composition = composeEventEffects(eventEntries);
    return {
      accountId: account.id,
      participantId: account.participantId,
      participantKind: account.kind,
      participantName: account.name,
      effects: composition.lines,
      composition,
      balanceAfter: deriveBalance(accountEntries)
    };
  }

  private ensureParticipantAttributes(type: EventType, merchant: string, attributes: Record<string, unknown>): void {
    if ((type === 'MARKETPLACE_SALE' || type === 'SELLER_PAYOUT') && typeof attributes.sellerId !== 'string') {
      const known = participantByName(merchant);
      attributes.sellerId = known?.kind === 'SELLER' ? known.participantId : merchant;
    }
    if ((type === 'WALLET_LOAD' || type === 'WALLET_SPEND') && typeof attributes.buyerId !== 'string') {
      const known = participantByName(merchant);
      attributes.buyerId = known?.kind === 'BUYER' ? known.participantId : merchant;
    }
  }

  private ensureParticipantAccount(kind: EngineParticipantKind, participantId: string, name: string): ParticipantAccount {
    const existing = this.participants.find((row) => row.kind === kind && row.participantId === participantId);
    if (existing !== undefined) {
      return existing;
    }
    const created = createParticipantAccount({
      id: engineId(`party-${kind}-${participantId}`),
      tenantId: this.tenantId,
      participantId,
      kind,
      name,
      currency: 'INR'
    });
    this.participants.push(created);
    return created;
  }

  private viewParticipants(): EngineParticipantView[] {
    return this.participants
      .slice()
      .sort((left, right) => left.participantId.localeCompare(right.participantId))
      .map((account) => {
        const entries = this.transactionalEntries.filter((entry) => entry.accountId === account.id);
        return {
          accountId: account.id,
          participantId: account.participantId,
          kind: account.kind,
          name: account.name,
          currency: account.currency,
          status: account.status,
          balance: deriveBalance(entries),
          entryCount: entries.length
        };
      });
  }

  private viewParticipantLedgers(): EngineParticipantLedgerView[] {
    return this.viewParticipants().map((participant) => {
      const entries = this.transactionalEntries.filter((entry) => entry.accountId === participant.accountId);
      return {
        ...participant,
        entries: runningLedger(entries).map((line) => ({
          id: line.entry.id,
          businessEventId: line.entry.businessEventId,
          transactionDisplayId: this.txDisplayIds.get(line.entry.businessEventId) ?? null,
          type: line.entry.type,
          description: line.entry.description,
          amount: line.entry.amount,
          direction: line.entry.direction,
          signedAmount: signedDelta(line.entry.direction, line.entry.amount),
          effectiveAt: line.entry.effectiveAt.toISOString(),
          runningBalance: line.runningBalance
        }))
      };
    });
  }
}

function seedLiveRule(rule: EngineRuleSeed, builtin: boolean): LiveRule {
  return {
    ...rule,
    enabled: true,
    builtin,
    kernelId: null,
    lines: treatmentLinesFor(rule).map((line) => ({ ...line }))
  };
}

function activityOf(rule: EngineRuleSeed): EventType | null {
  const condition = rule.conditions.find((item) => item.field === 'eventType');
  if (condition === undefined || Array.isArray(condition.value)) {
    return null;
  }
  const value = String(condition.value).toUpperCase();
  if (
    value === 'PURCHASE'
    || value === 'PAYMENT'
    || value === 'REFUND'
    || value === 'USAGE'
    || value === 'WALLET_LOAD'
    || value === 'WALLET_SPEND'
    || value === 'MARKETPLACE_SALE'
    || value === 'SELLER_PAYOUT'
  ) {
    return value;
  }
  return null;
}

function amountLabelFor(line: EngineTreatmentLineSeed): string {
  if (line.amountType === 'FIXED_AMOUNT' && line.value !== undefined) {
    return `Fixed amount ${line.value} ${line.currency ?? ''}`.trim();
  }
  if (line.amountType === 'ATTRIBUTE_AMOUNT' && line.attribute !== undefined) {
    return `Attribute ${line.attribute}`;
  }
  if (line.amountType === 'RATE_AMOUNT' && line.rate !== undefined) {
    return `${Math.round(line.rate * 1000) / 10}% of amount`;
  }
  return 'Transaction amount';
}

function transactionalAmountLabel(amount: TransactionalTreatment['effects'][number]['amount']): string {
  if (amount.type === 'FIXED') {
    return `₹${amount.value.toLocaleString('en-IN')}`;
  }
  if (amount.type === 'RATE') {
    return `${Math.round(amount.rate * 1000) / 10}% of sale`;
  }
  return 'Sale amount';
}

function formatSigned(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

function participantIdFromAttributes(event: BusinessEvent): string | null {
  if (typeof event.attributes.sellerId === 'string') {
    return event.attributes.sellerId;
  }
  if (typeof event.attributes.buyerId === 'string') {
    return event.attributes.buyerId;
  }
  return null;
}

function viewExample(example: EngineExampleSeed): EngineExampleView {
  return {
    key: example.key,
    merchant: example.merchant,
    amount: example.amount,
    type: example.type,
    category: example.category,
    mark: example.mark,
    tint: example.tint,
    ...(example.usage !== undefined ? { usage: example.usage } : {})
  };
}

function displayRuleId(priority: number): string {
  return `R${String(priority).padStart(3, '0')}`;
}

function typeLabel(type: EventType): string {
  if (type === 'REFUND') {
    return 'Refund';
  }
  if (type === 'PAYMENT') {
    return 'Fee';
  }
  if (type === 'USAGE') {
    return 'Usage';
  }
  if (type === 'WALLET_LOAD') {
    return 'Wallet Load';
  }
  if (type === 'WALLET_SPEND') {
    return 'Wallet Purchase';
  }
  if (type === 'MARKETPLACE_SALE') {
    return 'Marketplace Sale';
  }
  if (type === 'SELLER_PAYOUT') {
    return 'Payout';
  }
  return 'Purchase';
}

function formatRupee(amount: number, type: EventType): string {
  const sign = type === 'REFUND' ? '-' : '';
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN')}`;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) {
    return value.slice(0, 2).toUpperCase();
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function emptyGeneralLedger(accounts: Account[]): {
  accountBalances: EngineAccountBalanceView[];
  accountLedgers: EngineAccountLedgerView[];
  trialBalance: EngineTrialBalanceView;
  ledgerTotals: EngineLedgerTotalsView;
} {
  const accountBalances = accounts
    .slice()
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((account) => ({
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      currency: account.currency ?? 'INR',
      totalDebits: 0,
      totalCredits: 0,
      balance: 0,
      balanceSide: (account.type === 'ASSET' || account.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT') as EngineAccountBalanceView['balanceSide'],
      entryCount: 0
    }));
  return {
    accountBalances,
    accountLedgers: accountBalances.map((balance) => ({
      ...balance,
      entries: []
    })),
    trialBalance: {
      asOf: new Date().toISOString(),
      currency: 'INR',
      lines: [],
      totalDebits: 0,
      totalCredits: 0,
      balanced: true
    },
    ledgerTotals: {
      accountCount: accounts.length,
      totalDebits: 0,
      totalCredits: 0,
      balanced: true,
      asOf: null,
      from: null,
      to: null,
      typeTotals: [
        { type: 'ASSET', balance: 0, balanceSide: 'DEBIT' },
        { type: 'LIABILITY', balance: 0, balanceSide: 'CREDIT' },
        { type: 'EQUITY', balance: 0, balanceSide: 'CREDIT' },
        { type: 'INCOME', balance: 0, balanceSide: 'CREDIT' },
        { type: 'EXPENSE', balance: 0, balanceSide: 'DEBIT' }
      ]
    }
  };
}
