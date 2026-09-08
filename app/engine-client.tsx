'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { commentaryFor } from './engine-commentary';
import { SutraCommentary } from './engine-commentary-card';
import { groupDemoExamples } from './engine-demo-groups';
import { EngineMachine, STAGE_HINTS, STAGE_TITLES, StageTheater } from './engine-machine';
import { EngineQueueRail, LiveQueueItem, makeQueueItem } from './engine-queue-rail';
import { ResultPanel } from './engine-result';
import { LedgerPanel } from './ledger-panel';
import { ReconPanel } from './recon-panel';
import { SettingsPanel, SettingsView } from './settings-panel';
import { StudioPanel } from './studio-panel';
import { TransactionsPanel } from './transactions-panel';
import { AccountingProposal, StudioRecentWork } from './studio-model';
import {
  EngineBalanceImpactView,
  EngineExampleView,
  EngineEventType,
  EngineLedgerPane,
  EngineMode,
  EngineProcessResult,
  EngineSnapshot,
  EngineView,
  STAGE_ORDER,
  StudioPane,
  parseEngineSnapshot,
  typeLabel,
  rupee
} from './engine-types';
import { parseNaturalLanguage } from './nl-input';

const EMPTY: EngineSnapshot = {
  rules: [],
  examples: [],
  accounts: [],
  transactions: [],
  participants: [],
  participantLedgers: [],
  ledger: [],
  accountBalances: [],
  accountLedgers: [],
  trialBalance: { asOf: new Date().toISOString(), currency: 'INR', lines: [], totalDebits: 0, totalCredits: 0, balanced: true },
  ledgerTotals: {
    accountCount: 0,
    totalDebits: 0,
    totalCredits: 0,
    balanced: true,
    asOf: null,
    from: null,
    to: null,
    typeTotals: []
  },
  metrics: { rules: 0, avgMs: 0, balancedPct: 100, errors: 0, posted: 0 },
  lastResult: null,
  policy: null,
  lastSimulation: null
};

export function EngineClient(): JSX.Element {
  const [snapshot, setSnapshot] = useState<EngineSnapshot>(EMPTY);
  const [view, setView] = useState<EngineView>('engine');
  const [mode, setMode] = useState<EngineMode>('live');
  const [selectedKey, setSelectedKey] = useState<string>('starbucks');
  const [merchant, setMerchant] = useState('Spotify');
  const [amount, setAmount] = useState('199');
  const [type, setType] = useState<EngineEventType>('PURCHASE');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [ledgerPane, setLedgerPane] = useState<EngineLedgerPane>('overview');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const [highlightAccountIds, setHighlightAccountIds] = useState<string[]>([]);
  const [highlightJournalId, setHighlightJournalId] = useState<string | null>(null);
  const [studioPane, setStudioPane] = useState<StudioPane>('overview');
  const [studioActivity, setStudioActivity] = useState<EngineEventType | null>(null);
  const [studioTransformationId, setStudioTransformationId] = useState<string | null>(null);
  const [studioContextEventId, setStudioContextEventId] = useState<string | null>(null);
  const [studioRecents, setStudioRecents] = useState<StudioRecentWork[]>([]);
  const [transactionRuleFilter, setTransactionRuleFilter] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [queue, setQueue] = useState<LiveQueueItem[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [idleTick, setIdleTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const [nlProcessing, setNlProcessing] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<SettingsView | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const processingRef = useRef(false);
  const startedIds = useRef(new Set<string>());
  const completeRef = useRef<(() => void) | null>(null);
  const modeRef = useRef<EngineMode>('live');
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const queueRef = useRef<LiveQueueItem[]>([]);
  modeRef.current = mode;
  busyRef.current = busy;
  runningRef.current = running;
  queueRef.current = queue;

  useEffect(() => {
    void load();
    void loadAiConfig();
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (queue.length > 0 || running || busy) {
      return;
    }
    const id = window.setInterval(() => setIdleTick((tick) => tick + 1), 8000);
    return () => window.clearInterval(id);
  }, [queue.length, running, busy]);

  useEffect(() => {
    if (!navOpen) {
      return;
    }
    function onPointer(event: MouseEvent): void {
      if (navRef.current !== null && !navRef.current.contains(event.target as Node)) {
        setNavOpen(false);
      }
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setNavOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  function clearTimers(): void {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }

  async function load(): Promise<void> {
    const next = await request('GET');
    if (next === null) {
      return;
    }
    setSnapshot(next);
    if (next.lastResult !== null) {
      setActiveIndex(STAGE_ORDER.length - 1);
      setRunning(false);
    }
  }

  async function loadAiConfig(): Promise<void> {
    try {
      const response = await fetch('/api/settings?action=get', { method: 'GET' });
      if (response.ok) {
        const data: SettingsView = await response.json();
        setAiConfig(data);
      }
    } catch {
      // AI config unavailable, not critical
    }
  }

  async function request(method: 'GET' | 'POST', body?: unknown): Promise<EngineSnapshot | null> {
    try {
      const response = await fetch('/api/engine', {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(body) : undefined
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError('Engine request failed.');
        return null;
      }
      setError(null);
      return parseEngineSnapshot(payload);
    } catch {
      setError('The engine API is unavailable.');
      return null;
    }
  }

  function finishPlay(): void {
    setRunning(false);
    const done = completeRef.current;
    completeRef.current = null;
    done?.();
  }

  function playResult(result: EngineProcessResult, playMode: EngineMode, onComplete?: () => void): void {
    clearTimers();
    completeRef.current = onComplete ?? null;
    setRunning(true);
    setActiveIndex(-1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || playMode === 'step') {
      setActiveIndex(playMode === 'step' ? 0 : STAGE_ORDER.length - 1);
      if (reduced || playMode !== 'step') {
        finishPlay();
      } else {
        setRunning(false);
      }
      return;
    }
    const stageMs = 1900;
    const leadMs = 220;
    STAGE_ORDER.forEach((_, index) => {
      const id = window.setTimeout(() => {
        setActiveIndex(index);
      }, leadMs + index * stageMs);
      timers.current.push(id);
    });
    const doneId = window.setTimeout(() => {
      finishPlay();
    }, leadMs + STAGE_ORDER.length * stageMs);
    timers.current.push(doneId);
  }

  function enqueue(example: EngineExampleView): void {
    setQueue((prev) => {
      const next = [...prev, makeQueueItem(example)];
      queueRef.current = next;
      return next;
    });
    setSelectedKey(example.key);
  }

  function releaseQueue(): void {
    processingRef.current = false;
    setQueue((prev) => {
      const next = prev.filter((item) => item.status !== 'processing');
      queueRef.current = next;
      return next;
    });
  }

  async function startItem(item: LiveQueueItem): Promise<void> {
    if (processingRef.current || startedIds.current.has(item.id)) {
      return;
    }
    startedIds.current.add(item.id);
    processingRef.current = true;
    setQueue((prev) => {
      const next = prev.map((row) => row.id === item.id ? { ...row, status: 'processing' as const } : row);
      queueRef.current = next;
      return next;
    });
    setSelectedKey(item.example.key);
    setBusy(true);
    const next = await request('POST', {
      action: 'process',
      merchant: item.example.merchant,
      amount: item.example.amount,
      type: item.example.type,
      category: item.example.category,
      mark: item.example.mark,
      tint: item.example.tint,
      remember: false,
      ...(item.example.usage !== undefined ? { usage: item.example.usage } : {})
    });
    setBusy(false);
    if (next === null || next.lastResult === null) {
      releaseQueue();
      return;
    }
    setSnapshot(next);
    playResult(next.lastResult, modeRef.current, releaseQueue);
  }

  function runExample(example: EngineExampleView): void {
    enqueue(example);
  }

  function runCustom(event: FormEvent): void {
    event.preventDefault();
    enqueue({
      key: `custom-${Date.now()}`,
      merchant: merchant.trim() || 'New Merchant',
      amount: Number(amount) || 0,
      type,
      category: department || typeLabel(type),
      mark: 'tx',
      tint: '#3b82f6'
    });
    setComposerOpen(false);
  }

  async function handleNlSubmit(): Promise<void> {
    const input = nlInput.trim();
    if (!input) return;

    setNlProcessing(true);
    setNlError(null);

    const parsed = parseNaturalLanguage(input);
    if (!parsed) {
      setNlError("Couldn't understand that. Try something like 'I paid ₹50,000 for office furniture from my HDFC account'.");
      setNlProcessing(false);
      return;
    }

    // Use the existing enqueue flow with parsed data
    enqueue({
      key: `nl-${Date.now()}`,
      merchant: parsed.merchant,
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category || typeLabel(parsed.type),
      mark: 'tx',
      tint: '#3b82f6'
    });

    setNlInput('');
    setNlProcessing(false);
  }

  function showDemos(): void {
    setComposerOpen(false);
    setExamplesOpen(true);
  }

  function closeExamples(): void {
    setExamplesOpen(false);
  }

  function handleExampleClick(example: EngineExampleView): void {
    runExample(example);
    setExamplesOpen(false);
  }

  useEffect(() => {
    if (processingRef.current || busyRef.current || runningRef.current) {
      return;
    }
    const nextItem = queue.find((item) => item.status === 'waiting');
    if (nextItem === undefined) {
      return;
    }
    void startItem(nextItem);
  }, [queue, busy, running]);

  function rerun(): void {
    const current = snapshot.examples.find((example) => example.key === selectedKey) ?? snapshot.examples[0];
    if (current !== undefined) {
      runExample(current);
    }
  }

  async function toggleRule(ruleId: string): Promise<void> {
    const next = await request('POST', { action: 'toggleRule', ruleId });
    if (next !== null) {
      setSnapshot(next);
    }
  }

  function showToast(message: string): void {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  function openPrimaryView(id: EngineView): void {
    if (id === 'studio') {
      setStudioPane('overview');
      setStudioTransformationId(null);
      setStudioContextEventId(null);
    }
    if (id === 'transactions') {
      setTransactionRuleFilter(null);
      setSelectedTransactionId(null);
      setSelectedParticipantId(null);
    }
    if (id === 'ledger') {
      setTransactionRuleFilter(null);
      if (ledgerPane === 'transactions') {
        setLedgerPane('overview');
      }
    }
    setView(id);
    setNavOpen(false);
  }

  function openLedger(impact: EngineBalanceImpactView[] = [], journalId?: string | null): void {
    const debitNormal = impact.find((row) => row.accountType === 'EXPENSE' || row.accountType === 'ASSET');
    const focus = debitNormal ?? impact[0];
    setLedgerPane('accounts');
    setSelectedJournalId(null);
    setSelectedTransactionId(null);
    setSelectedAccountId(focus?.accountId ?? null);
    setHighlightAccountIds(impact.map((row) => row.accountId));
    setHighlightJournalId(journalId ?? null);
    setView('ledger');
  }

  function openAccount(accountId: string): void {
    setLedgerPane('accounts');
    setSelectedAccountId(accountId);
    setSelectedJournalId(null);
    setSelectedTransactionId(null);
    setView('ledger');
  }

  function openTransaction(eventId: string): void {
    setSelectedTransactionId(eventId);
    setSelectedJournalId(null);
    setSelectedAccountId(null);
    setView('transactions');
  }

  function openJournal(journalId: string): void {
    setLedgerPane('journals');
    setSelectedJournalId(journalId);
    setSelectedAccountId(null);
    setView('ledger');
  }

  function rememberStudioWork(transformationId: string, detail: string, rules = snapshot.rules): void {
    const rule = rules.find((row) => row.displayId === transformationId || row.id === transformationId);
    if (rule === undefined) {
      return;
    }
    setStudioRecents((prev) => [
      {
        transformationId: rule.displayId,
        title: `${rule.displayId} ${rule.name}`,
        detail,
        at: Date.now()
      },
      ...prev.filter((item) => item.transformationId !== rule.displayId)
    ].slice(0, 4));
  }

  function viewTransformation(ruleId: string | null, eventId?: string | null, detail?: string): void {
    setFocusRuleId(ruleId);
    setStudioTransformationId(ruleId);
    setStudioContextEventId(eventId ?? null);
    setStudioPane(ruleId === null ? 'overview' : 'transformations');
    setView('studio');
    if (ruleId !== null) {
      const why = eventId !== undefined && eventId !== null;
      rememberStudioWork(ruleId, detail ?? (why ? 'You asked why this posted' : 'You viewed this transformation'));
    }
  }

  async function teachSutra(merchant: string, type: EngineEventType): Promise<void> {
    const next = await request('POST', {
      action: 'addRule',
      merchant,
      type,
      name: `${merchant} rule`,
      debitCode: type === 'USAGE' ? '6200' : '5000',
      creditCode: type === 'USAGE' ? '2100' : '1010'
    });
    if (next === null) {
      return;
    }
    setSnapshot(next);
    const created = next.rules.find((rule) =>
      rule.name.toLowerCase() === `${merchant} rule`.toLowerCase()
      || rule.conditionDetails.some((condition) => condition.field === 'counterparty' && condition.value === merchant)
    );
    viewTransformation(created?.displayId ?? next.rules[0]?.displayId ?? null);
    showToast(`Transformation added for ${merchant}. Run the transaction again to post it.`);
  }

  async function createFromProposal(proposal: AccountingProposal): Promise<void> {
    const debit = proposal.lines.find((line) => line.side === 'DEBIT');
    const credit = proposal.lines.find((line) => line.side === 'CREDIT');
    const counterparty = proposal.conditions.find((condition) => condition.field === 'counterparty');
    const amount = proposal.conditions.find((condition) => condition.field === 'amount');
    if (debit?.accountCode === undefined || debit.accountCode === null || credit?.accountCode === undefined || credit.accountCode === null) {
      showToast('Choose or create both accounts before creating the transformation.');
      return;
    }
    const merchant = counterparty === undefined ? '' : String(counterparty.value);
    const lines = proposal.lines
      .filter((line) => line.accountCode !== null)
      .map((line) => ({
        side: line.side,
        accountCode: line.accountCode as string,
        amountType: line.amountType ?? 'EVENT_AMOUNT',
        ...(line.rate !== undefined ? { rate: line.rate } : {}),
        ...(line.description !== undefined ? { description: line.description } : {})
      }));
    const next = await request('POST', {
      action: 'addRule',
      merchant,
      name: proposal.name,
      debitCode: debit.accountCode,
      creditCode: credit.accountCode,
      type: proposal.activity,
      ...(typeof amount?.value === 'number' ? { minAmount: amount.value } : {}),
      ...(lines.length >= 2 ? { lines } : {}),
      ...(proposal.transactional !== undefined ? { transactional: proposal.transactional } : {})
    });
    if (next === null) {
      return;
    }
    setSnapshot(next);
    const created = next.rules.find((rule) =>
      rule.name === proposal.name
      || rule.conditionDetails.some((condition) => condition.field === 'counterparty' && condition.value === merchant)
    );
    const createdId = created?.displayId ?? next.rules[0]?.displayId ?? null;
    if (createdId !== null) {
      rememberStudioWork(createdId, 'You taught Kanakku this change', next.rules);
    }
    viewTransformation(createdId, null, 'You taught Kanakku this change');
    showToast('Transformation created. Simulate it, then run a transaction to post.');
  }

  async function addStudioAccount(input: {
    name: string;
    code: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
    parentCode?: string;
    currency?: string;
  }): Promise<void> {
    const next = await request('POST', { action: 'addAccount', ...input });
    if (next !== null) {
      setSnapshot(next);
      showToast(`${input.name} added to the chart of accounts.`);
    }
  }

  async function updateStudioAccount(input: {
    code: string;
    name?: string;
    type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  }): Promise<void> {
    const next = await request('POST', { action: 'updateAccount', ...input });
    if (next !== null) {
      setSnapshot(next);
    }
  }

  function viewTransactionsFor(ruleId: string): void {
    const matches = snapshot.transactions.filter((row) => row.selectedRule === ruleId);
    setTransactionRuleFilter(ruleId);
    setSelectedJournalId(null);
    setSelectedAccountId(null);
    setSelectedTransactionId(matches[0]?.eventId ?? null);
    setView('transactions');
  }

  function openAccountByCode(code: string): void {
    const account = snapshot.accountBalances.find((row) => row.code === code);
    if (account === undefined) {
      return;
    }
    setLedgerPane('accounts');
    setSelectedAccountId(account.accountId);
    setSelectedJournalId(null);
    setSelectedTransactionId(null);
    setView('ledger');
  }

  async function simulateTransformation(ruleId: string, eventId?: string): Promise<void> {
    setBusy(true);
    const next = await request('POST', {
      action: 'simulate',
      ruleId,
      ...(eventId !== undefined ? { eventId } : {})
    });
    setBusy(false);
    if (next === null) {
      return;
    }
    setSnapshot(next);
    rememberStudioWork(ruleId, 'You simulated this change', next.rules);
  }

  async function addStudioCondition(ruleId: string, field: string, op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN', value: string | number): Promise<void> {
    const next = await request('POST', { action: 'addCondition', ruleId, field, op, value });
    if (next !== null) {
      setSnapshot(next);
    }
  }

  async function addStudioLine(ruleId: string, side: 'DEBIT' | 'CREDIT', accountCode: string): Promise<void> {
    const next = await request('POST', { action: 'addTreatmentLine', ruleId, side, accountCode });
    if (next !== null) {
      setSnapshot(next);
    }
  }

  async function viewStudioInEngine(ruleId: string, eventId: string | null): Promise<void> {
    if (eventId !== null) {
      await viewInEngine(eventId);
      return;
    }
    const match = snapshot.transactions.find((row) => row.selectedRule === ruleId);
    if (match !== undefined) {
      await viewInEngine(match.eventId);
      return;
    }
    showToast('No posted transaction for this transformation yet. Simulate it here, or run one in Engine.');
  }

  async function viewInEngine(eventId: string): Promise<void> {
    const next = await request('POST', { action: 'replay', eventId });
    if (next === null) {
      return;
    }
    setSnapshot(next);
    if (next.lastResult !== null) {
      playResult(next.lastResult, 'live');
    }
    setView('engine');
  }

  function sendReconToEngine(merchant: string, amount: number, type: EngineEventType): void {
    enqueue({
      key: `recon-${merchant.toLowerCase().replace(/\s+/g, '-')}`,
      merchant,
      amount,
      type,
      category: typeLabel(type),
      mark: merchant.slice(0, 2).toUpperCase(),
      tint: '#39a8ff'
    });
    setView('engine');
    showToast(`Sent ${merchant} to Engine.`);
  }

  function step(): void {
    if (snapshot.lastResult === null && !processingRef.current) {
      return;
    }
    if (activeIndex >= STAGE_ORDER.length - 1) {
      finishPlay();
      return;
    }
    setActiveIndex((index) => Math.min(index + 1, STAGE_ORDER.length - 1));
    setRunning(false);
  }

  const selected = snapshot.examples.find((example) => example.key === selectedKey) ?? snapshot.examples[0];
  const result = snapshot.lastResult;
  const revealed = Math.max(activeIndex, -1);
  const demoGroups = groupDemoExamples(snapshot.examples);
  const queued = queue.some((item) => item.status === 'processing');
  const processing = busy || running || queued;
  const commentary = commentaryFor({
    queueCount: queue.length,
    processing: running || queued,
    activeIndex,
    result,
    idleTick
  });

  return (
    <div className={`app${busy ? ' busy-app' : ''}${view === 'engine' || view === 'ledger' || view === 'studio' || view === 'transactions' || view === 'recon' ? ' fit' : ''}`}>
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => openPrimaryView('engine')}
          title="Go to Engine"
        >
          <span className="mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 3 20h18L12 2Z" /></svg>
          </span>
          KANAKKU
        </button>
        <div className="tag">Speak English. Kanakku handles the accounting.</div>
        <div className="nav-wrap" ref={navRef}>
          <button
            className="nav-toggle"
            type="button"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
          <nav className={`nav${navOpen ? ' open' : ''}`} id="primary-nav" aria-label="Primary">
            {([['transactions', 'Transactions'], ['engine', 'Engine'], ['studio', 'Accounting Studio'], ['ledger', 'Ledger'], ['recon', 'Recon']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={view === id ? 'active' : ''}
                onClick={() => openPrimaryView(id)}
              >{label}</button>
            ))}
            <div className="nav-divider" />
            <button
              type="button"
              className={`nav-settings-btn${view === 'settings' ? ' active' : ''}`}
              onClick={() => openPrimaryView('settings')}
              title="AI / LLM Settings"
            >
              ⚙ Settings
            </button>
          </nav>
        </div>
        <div className="top-actions">
          <div className="avatar" title="Operator">JD</div>
        </div>
      </header>

      <main className={`workspace${view === 'engine' ? ' engine-workspace' : ''}`}>
        {view === 'engine' && (
          <>
            <div className="nl-command-bar">
              <div className="nl-command-input-wrapper">
                <label htmlFor="nl-input" className="nl-command-label">Tell Kanakku what happened on your Marketplace (Demo Usecase).</label>
                <div className="nl-command-input-group">
                  <input
                    id="nl-input"
                    type="text"
                    value={nlInput}
                    onChange={(e) => setNlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNlSubmit()}
                    placeholder="I paid ₹50,000 for office furniture from my HDFC account."
                    className="nl-command-input"
                    disabled={nlProcessing}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleNlSubmit}
                    disabled={nlProcessing || !nlInput.trim()}
                    className={`btn primary nl-command-btn${nlProcessing ? ' processing' : ''}`}
                  >
                    {nlProcessing ? 'Processing...' : '→ Process'}
                  </button>
                </div>
              </div>
              {nlError && <p className="nl-command-error">{nlError}</p>}
              <div className="nl-command-examples">
                <span className="nl-command-examples-label">Try an example:</span>
                <div className="nl-command-examples-list">
                  {snapshot.examples
                    .filter(example => !example.key.startsWith('custom-'))
                    .slice(0, 4)
                    .map((example) => {
                      // Generate natural language sentence based on transaction type
                      let sentence = '';
                      switch (example.type) {
                        case 'PURCHASE':
                          sentence = `I paid ${rupee(example.amount)} at ${example.merchant}`;
                          break;
                        case 'PAYMENT':
                          sentence = `A customer paid ${rupee(example.amount)} to my marketplace`;
                          break;
                        case 'REFUND':
                          sentence = `I refunded ${rupee(example.amount)} to ${example.merchant}`;
                          break;
                        case 'USAGE':
                          sentence = `My marketplace used ${example.merchant} for ${rupee(example.amount)}`;
                          break;
                        case 'WALLET_LOAD':
                          sentence = `A buyer loaded ${rupee(example.amount)} into their wallet`;
                          break;
                        case 'MARKETPLACE_SALE':
                          sentence = `A seller just made a ${rupee(example.amount)} sale on my marketplace`;
                          break;
                        case 'SELLER_PAYOUT':
                          sentence = `I paid ${example.merchant} a ${rupee(example.amount)} seller payout`;
                          break;
                        default:
                          sentence = `${example.merchant} - ${typeLabel(example.type)} - ${rupee(example.amount)}`;
                      }

                      return (
                        <button
                          key={example.key}
                          type="button"
                          onClick={() => setNlInput(sentence)}
                          className="nl-command-example-chip"
                        >
                          {sentence}
                        </button>
                      );
                    })}
                  <button
                    type="button"
                    onClick={() => setExamplesOpen(true)}
                    className="nl-command-example-chip view-more-chip"
                  >
                    View more →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {examplesOpen && (
          <div className="examples-drawer-overlay" onClick={closeExamples}>
            <div className="examples-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="examples-drawer-header">
                <h2>Try an example</h2>
                <button type="button" className="examples-drawer-close" onClick={closeExamples} aria-label="Close examples">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="examples-drawer-content">
                {demoGroups.map((group) => (
                  <div className="examples-drawer-group" key={group.id}>
                    <h3>{group.label}</h3>
                    <div className="examples-drawer-list">
                      {group.examples.map((example) => (
                        <button
                          key={example.key}
                          type="button"
                          className="examples-drawer-item"
                          onClick={() => handleExampleClick(example)}
                        >
                          <span className="examples-drawer-merchant">{example.merchant}</span>
                          <span className="examples-drawer-meta">{typeLabel(example.type)}</span>
                          <span className="examples-drawer-amt">{rupee(example.amount, example.type)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {view === 'engine' ? (
          <div className="engine-grid live-engine no-sidebar">
            <div className="engine-stage">
              <section className="engine-container" aria-label="Accounting engine">
                <div className="headline engine-container-head">
                  <div>
                    <h1 className="engine-title">Kanakku Accounting Engine</h1>
                    <p>Watch Kanakku turn your words into accounting.</p>
                  </div>
                  <div className="headline-tools">
                    <button className="btn tiny" type="button" onClick={rerun} disabled={busy || selected === undefined}>▶ Run again</button>
                    <div className="mode" role="group" aria-label="Playback">
                      <button type="button" className={mode === 'live' ? 'active live' : ''} onClick={() => setMode('live')}>
                        <span className="dot" /> Live
                      </button>
                      <button type="button" className={mode === 'step' ? 'active step' : ''} onClick={() => setMode('step')}>
                        Step
                      </button>
                    </div>
                  </div>
                </div>
                {mode === 'step' && processing ? (
                  <div className="step-rail">
                    <div>
                      <div className="result-kicker">Step {Math.max(activeIndex, 0) + 1} of {STAGE_ORDER.length}</div>
                      <b>{STAGE_TITLES[Math.max(activeIndex, 0)]}</b>
                      <span className="meta">{activeIndex >= 5 && result?.journal?.posted === true ? '✓ Posted' : STAGE_HINTS[Math.max(activeIndex, 0)]}</span>
                    </div>
                    <button className="btn tiny" type="button" onClick={step}>
                      {activeIndex >= STAGE_ORDER.length - 1 ? 'Process next transaction →' : 'Next stage →'}
                    </button>
                  </div>
                ) : null}
                <EngineMachine
                  result={result}
                  activeIndex={activeIndex}
                  running={running}
                  animating={running || (mode === 'step' && queued && activeIndex >= 0 && activeIndex < STAGE_ORDER.length - 1)}
                  mode={mode}
                  onStep={mode === 'step' ? step : () => undefined}
                />
              </section>
              <StageTheater
                result={result}
                activeIndex={activeIndex}
                running={running}
              />
              <SutraCommentary
                commentary={commentary}
                empty={queue.length === 0 && !running && !queued}
              />
              {error !== null ? <p className="notice">{error}</p> : null}
            </div>
            <ResultPanel
              selected={selected}
              result={result}
              revealed={result !== null && !running && !queued ? STAGE_ORDER.length - 1 : revealed}
              busy={running && activeIndex >= 0 && activeIndex < STAGE_ORDER.length - 1}
              onLedger={() => openLedger(result?.balanceImpact ?? [], result?.journal?.id)}
              onTransaction={() => {
                if (result !== null) {
                  openTransaction(result.eventId);
                }
              }}
              onJournal={() => {
                if (result?.journal !== null && result !== null) {
                  openJournal(result.journal.id);
                }
              }}
            />
          </div>
        ) : null}

        {view === 'studio' ? (
          <>
            <div className="settings-ai-status-bar">
              {aiConfig?.configured ? (
                <span className="settings-ai-status configured">
                  <span className="dot" />
                  AI configured
                </span>
              ) : (
                <span className="settings-ai-status not-configured">
                  <span className="dot" />
                  AI provider not configured
                  <button
                    type="button"
                    className="settings-configure-link"
                    onClick={() => openPrimaryView('settings')}
                  >
                    Configure AI
                  </button>
                </span>
              )}
            </div>
            <StudioPanel
            snapshot={snapshot}
            pane={studioPane}
            activity={studioActivity}
            transformationId={studioTransformationId}
            contextEventId={studioContextEventId}
            recents={studioRecents}
            busy={busy}
            onPane={setStudioPane}
            onSelectActivity={setStudioActivity}
            onOpenTransformation={(id, eventId) => viewTransformation(id, eventId)}
            onCloseTransformation={() => {
              setStudioTransformationId(null);
              setStudioContextEventId(null);
              setStudioPane('transformations');
            }}
            onCreateProposal={(proposal) => void createFromProposal(proposal)}
            onAddAccount={(input) => void addStudioAccount(input)}
            onUpdateAccount={(input) => void updateStudioAccount(input)}
            onSimulate={(ruleId, eventId) => void simulateTransformation(ruleId, eventId)}
            onViewInEngine={(ruleId, eventId) => void viewStudioInEngine(ruleId, eventId)}
            onViewTransactions={viewTransactionsFor}
            onOpenAccount={openAccountByCode}
            onAddCondition={(ruleId, field, op, value) => void addStudioCondition(ruleId, field, op, value)}
            onAddLine={(ruleId, side, accountCode) => void addStudioLine(ruleId, side, accountCode)}
            onToggle={(id) => void toggleRule(id)}
          />
          </>
        ) : null}

        {view === 'transactions' ? (
          <TransactionsPanel
            snapshot={snapshot}
            selectedTransactionId={selectedTransactionId}
            selectedParticipantId={selectedParticipantId}
            ruleFilter={transactionRuleFilter}
            onSelectTransaction={setSelectedTransactionId}
            onSelectParticipant={setSelectedParticipantId}
            onOpenTransaction={(eventId) => {
              setSelectedParticipantId(null);
              openTransaction(eventId);
            }}
            onOpenParticipant={(accountId) => {
              setSelectedParticipantId(accountId);
            }}
            onOpenJournal={openJournal}
            onOpenAccount={openAccount}
            onViewTransformation={viewTransformation}
            onViewInEngine={(eventId) => void viewInEngine(eventId)}
            onTeachSutra={(merchant, type) => void teachSutra(merchant, type)}
            onClearRuleFilter={() => setTransactionRuleFilter(null)}
          />
        ) : null}

        {view === 'recon' ? (
          <ReconPanel
            snapshot={snapshot}
            onOpenTransaction={openTransaction}
            onOpenJournal={openJournal}
            onSendToEngine={sendReconToEngine}
          />
        ) : null}

        {view === 'ledger' ? (
          <LedgerPanel
            snapshot={snapshot}
            surface="ledger"
            pane={ledgerPane === 'transactions' ? 'overview' : ledgerPane}
            selectedAccountId={selectedAccountId}
            selectedJournalId={selectedJournalId}
            selectedTransactionId={selectedTransactionId}
            highlightAccountIds={highlightAccountIds}
            highlightJournalId={highlightJournalId}
            onPane={(pane) => {
              setLedgerPane(pane);
              setSelectedAccountId(null);
              setSelectedJournalId(null);
              setSelectedTransactionId(null);
              setTransactionRuleFilter(null);
            }}
            onSelectAccount={setSelectedAccountId}
            onSelectJournal={setSelectedJournalId}
            onSelectTransaction={setSelectedTransactionId}
            onOpenAccount={openAccount}
            onOpenJournal={openJournal}
            onOpenTransaction={openTransaction}
            onViewTransformation={viewTransformation}
            onTeachSutra={(merchant, type) => void teachSutra(merchant, type)}
            onViewInEngine={(eventId) => void viewInEngine(eventId)}
            transactionRuleFilter={transactionRuleFilter}
            onClearTransactionFilter={() => setTransactionRuleFilter(null)}
          />
        ) : null}

        {view === 'settings' ? (
          <div className="settings-workspace">
            <SettingsPanel />
          </div>
        ) : null}
      </main>
      <div className={`toast${toast !== null ? ' show' : ''}`}>{toast}</div>
    </div>
  );
}
