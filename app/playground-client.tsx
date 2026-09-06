'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PlaygroundAction, PlaygroundSnapshot, STATIONS, activeStation, parsePlaygroundSnapshot, rupee } from './playground-types';

const EMPTY: PlaygroundSnapshot = {
  instruction: '',
  dsl: '',
  authoringStatus: 'IDLE',
  policyStatus: null,
  provider: 'fake',
  clarificationNeeds: [],
  unsupportedReason: null,
  error: null,
  validation: null,
  simulation: null,
  ledger: null,
  accounts: [],
  sampleEvents: [],
  allowedActions: ['author']
};

export function PlaygroundClient() {
  const [snapshot, setSnapshot] = useState<PlaygroundSnapshot>(EMPTY);
  const [instruction, setInstruction] = useState('');
  const [dsl, setDsl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState(): Promise<void> {
    const next = await request('GET');
    if (next === null) {
      return;
    }
    apply(next, false);
  }

  async function run(action: PlaygroundAction, extra?: { instruction?: string; dsl?: string }): Promise<void> {
    setBusy(true);
    const next = await request('POST', { action, ...extra });
    setBusy(false);
    if (next === null) {
      return;
    }
    apply(next, action === 'replaceDsl' || action === 'author' || action === 'reset');
  }

  function apply(next: PlaygroundSnapshot, syncEditors: boolean): void {
    setSnapshot(next);
    if (syncEditors || instruction.length === 0) {
      setInstruction(next.instruction);
    }
    if (syncEditors || dsl.length === 0) {
      setDsl(next.dsl);
    }
    if (actionNeedsDslSync(next)) {
      setDsl(next.dsl);
    }
  }

  async function request(method: 'GET' | 'POST', body?: unknown): Promise<PlaygroundSnapshot | null> {
    try {
      const response = await fetch('/api/playground', {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(body) : undefined
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setLoadError('Playground request failed.');
        return null;
      }
      const snapshot = parsePlaygroundSnapshot(payload);
      setLoadError(null);
      return snapshot;
    } catch {
      setLoadError('The playground API is unavailable.');
      return null;
    }
  }

  function can(action: PlaygroundAction): boolean {
    return snapshot.allowedActions.includes(action);
  }

  async function onAuthor(event: FormEvent): Promise<void> {
    event.preventDefault();
    await run('author', { instruction });
  }

  const station = activeStation(snapshot);

  return (
    <main className={`shell${busy ? ' busy' : ''}`}>
      <header className="masthead">
        <div>
          <div className="wordmark">Sutra</div>
          <p className="subtitle">AI-native accounting policy and ledger engine. A policy moves through a deterministic machine, not a dashboard.</p>
        </div>
        <p className="trust">AI proposes. Kanakku validates. Simulation proves. Human approves. Deterministic accounting posts.</p>
      </header>

      <nav className="rail" aria-label="Policy path">
        {STATIONS.map((name) => (
          <div key={name} className={name === station ? 'station active' : 'station'}>{name}</div>
        ))}
      </nav>

      <section className="sheet">
        <h1 className="hero-copy">Tell Kanakku how you want this transaction accounted.</h1>
        <form onSubmit={onAuthor}>
          <textarea
            className="intent"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            aria-label="Policy intent"
          />
          <div className="row">
            <button className="btn" type="submit" disabled={!can('author') || busy}>Understand policy</button>
            <button className="ghost" type="button" onClick={() => void run('reset')} disabled={busy}>Reset machine</button>
            <span className="muted">Provider {snapshot.provider}</span>
          </div>
        </form>
        {loadError !== null ? <p className="banner bad">{loadError}</p> : null}
      </section>

      {snapshot.authoringStatus === 'NEEDS_CLARIFICATION' ? (
        <aside className="banner">
          <p className="kicker">Needs clarification</p>
          <p>Kanakku will not invent missing policy facts.</p>
          <ul>
            {snapshot.clarificationNeeds.map((need) => <li key={need}>{need}</li>)}
          </ul>
        </aside>
      ) : null}

      {snapshot.authoringStatus === 'UNSUPPORTED' ? (
        <aside className="banner bad">
          <p className="kicker">Unsupported intent</p>
          <p>{snapshot.unsupportedReason}</p>
        </aside>
      ) : null}

      {snapshot.authoringStatus === 'COMPILED' || snapshot.authoringStatus === 'REJECTED' || snapshot.dsl.length > 0 ? (
        <section className="split">
          <article className="panel">
            <p className="kicker">AI interpretation</p>
            <p>
              <span className={`status-pill ${snapshot.policyStatus === 'AI_GENERATED' ? 'warn' : 'live'}`}>
                {snapshot.policyStatus ?? snapshot.authoringStatus}
              </span>
            </p>
            <ul className="checklist">
              <li>{snapshot.authoringStatus === 'COMPILED' ? 'Intent compiled through the Kanakku DSL parser.' : 'No executable policy yet.'}</li>
              <li>{snapshot.accounts.map((account) => `${account.code} ${account.name}`).join(' · ')}</li>
              <li>AI-generated policies stay {snapshot.policyStatus === 'AI_GENERATED' ? 'AI_GENERATED until you validate.' : 'inside the lifecycle you advance.'}</li>
            </ul>
          </article>
          <article className="panel">
            <p className="kicker">Kanakku Policy DSL</p>
            <textarea
              className="dsl"
              value={dsl}
              onChange={(event) => setDsl(event.target.value)}
              spellCheck={false}
              aria-label="Policy DSL"
            />
            <div className="row">
              <button className="btn secondary" type="button" disabled={!can('replaceDsl') || busy} onClick={() => void run('replaceDsl', { dsl })}>Apply DSL edit</button>
              <button className="btn" type="button" disabled={!can('validate') || busy} onClick={() => void applyThen('validate')}>Validate</button>
            </div>
            {snapshot.authoringStatus === 'REJECTED' && snapshot.error !== null ? (
              <p className="banner bad">{snapshot.error}</p>
            ) : null}
          </article>
        </section>
      ) : null}

      {snapshot.validation !== null ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <p className="kicker">Validation</p>
          <p className={snapshot.validation.valid ? 'posted' : undefined}>
            {snapshot.validation.valid ? 'PolicyIR is structurally valid. No journal was posted.' : 'Validation failed.'}
          </p>
          {snapshot.validation.issues.length > 0 ? (
            <ul>{snapshot.validation.issues.map((issue) => <li key={issue.message}>{issue.code}: {issue.message}</li>)}</ul>
          ) : null}
          <div className="row">
            <button className="btn" type="button" disabled={!can('simulate') || busy} onClick={() => void run('simulate')}>Simulate</button>
          </div>
        </section>
      ) : null}

      {snapshot.simulation !== null ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <p className="kicker">Simulation</p>
          <p className="posted">Read-only preview. Posted journals: {snapshot.simulation.didPost ? 'yes' : 'none'}.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Result</th>
                  <th>Accounting</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.simulation.events.map((event) => (
                  <tr key={event.eventId}>
                    <td>{event.label}</td>
                    <td>{event.matched ? 'Match' : 'No match'}</td>
                    <td>
                      {event.lines.length === 0 ? '—' : event.lines.map((line) => (
                        <div key={`${event.eventId}-${line.accountCode}-${line.debit}-${line.credit}`}>
                          {line.debit > 0 ? <span className="dr">DR {line.accountName} {rupee(line.debit)}</span> : null}
                          {line.credit > 0 ? <span className="cr">CR {line.accountName} {rupee(line.credit)}</span> : null}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="totals">
            <span className="dr">Debits {rupee(snapshot.simulation.totalDebits)}</span>
            <span className="cr">Credits {rupee(snapshot.simulation.totalCredits)}</span>
          </div>
          <div className="row">
            <button className="btn" type="button" disabled={!can('approve') || busy} onClick={() => void run('approve')}>Approve policy</button>
          </div>
        </section>
      ) : null}

      {snapshot.policyStatus === 'APPROVED' || snapshot.policyStatus === 'ACTIVE' || snapshot.ledger !== null ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <p className="kicker">Lifecycle</p>
          <p className="status-pill live">{snapshot.policyStatus}</p>
          <div className="row">
            <button className="btn" type="button" disabled={!can('activate') || busy} onClick={() => void run('activate')}>Activate</button>
            <button className="btn" type="button" disabled={!can('process') || busy} onClick={() => void run('process')}>Process events</button>
          </div>
        </section>
      ) : null}

      {snapshot.ledger !== null ? (
        <section className="panel" style={{ marginTop: 18 }}>
          <p className="kicker">Ledger</p>
          {snapshot.ledger.entries.map((entry) => (
            <div className="ledger-card" key={entry.eventId}>
              <strong>{entry.label}</strong>
              <div className="muted">{entry.posted ? `POSTED · ${entry.status ?? 'POSTED'}` : `Not posted · ${entry.reason}`}</div>
              {entry.lines.map((line) => (
                <div key={`${entry.eventId}-${line.accountCode}`}>
                  {line.accountName}
                  {' '}
                  {line.debit > 0 ? <span className="dr">DR {rupee(line.debit)}</span> : <span className="cr">CR {rupee(line.credit)}</span>}
                </div>
              ))}
              {entry.posted ? (
                <p className="balance">{entry.balanced ? 'Balanced' : 'Unbalanced'} {rupee(entry.totalDebits)} = {rupee(entry.totalCredits)}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {snapshot.error !== null && snapshot.authoringStatus !== 'REJECTED' ? (
        <p className="banner bad">{snapshot.error}</p>
      ) : null}
    </main>
  );

  async function applyThen(action: PlaygroundAction): Promise<void> {
    if (dsl !== snapshot.dsl && can('replaceDsl')) {
      await run('replaceDsl', { dsl });
    }
    await run(action);
  }
}

function actionNeedsDslSync(next: PlaygroundSnapshot): boolean {
  return next.authoringStatus === 'COMPILED' || next.authoringStatus === 'REJECTED';
}
