'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  EngineEventType,
  EngineSnapshot,
  rupee
} from './engine-types';
import {
  filterCount,
  formatReconDate,
  formatReconDay,
  itemTitle,
  liveJournalIdFor,
  liveTransactionFor,
  loadDemoRecon,
  partyLabel,
  RECON_FILTERS,
  ReconFilter,
  reconCommentary,
  reconSummary,
  ReconciliationItem,
  ReconciliationRun,
  statusLabel,
  statusMark,
  statusTone,
  toEngineEventType
} from './recon-model';
import { ReconService } from '../src/application/recon/ReconService';

export function ReconPanel(props: {
  snapshot: EngineSnapshot;
  onOpenTransaction: (eventId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onSendToEngine: (merchant: string, amount: number, type: EngineEventType) => void;
}): JSX.Element {
  const [run, setRun] = useState<ReconciliationRun>(() => loadDemoRecon());
  const [filter, setFilter] = useState<ReconFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(run.items[0]?.id ?? null);
  const [reason, setReason] = useState('');
  const [resolving, setResolving] = useState(false);
  const summary = useMemo(() => reconSummary(run), [run]);
  const rows = useMemo(() => ReconService.filter(run, filter), [run, filter]);
  const selected = rows.find((item) => item.id === selectedId) ?? rows[0] ?? null;

  function select(item: ReconciliationItem): void {
    setSelectedId(item.id);
    setResolving(false);
    setReason('');
  }

  function markResolved(event: FormEvent): void {
    event.preventDefault();
    if (selected === null) {
      return;
    }
    const next = ReconService.resolve(run, selected.id, reason);
    setRun(next);
    setResolving(false);
    setReason('');
  }

  return (
    <section className="panel page-panel ledger-page recon-page">
      <div className="ledger-head recon-head">
        <div>
          <div className="recon-kicker">Recon</div>
          <h1>Reconciliation</h1>
          <p className="sub">Make sure what happened matches what Kanakku accounted for.</p>
        </div>
      </div>

      <article className="recon-statement">
        <div className="recon-statement-top">
          <div>
            <div className="recon-kicker">{run.sourceLabel} · {formatReconDate(run.date)}</div>
            <div className="recon-axis">
              <span>External activity</span>
              <span className="recon-axis-join" aria-hidden="true">↕</span>
              <span>Kanakku accounting</span>
            </div>
          </div>
          <div className="recon-statement-total">
            <b>{rupee(summary.externalTotal)}</b>
            <small>{summary.itemCount} transactions</small>
          </div>
        </div>
        <div className="recon-counts" aria-label="Reconciliation summary">
          <span className="ok">✓ {summary.matched} Matched</span>
          <span className="warn">⚠ {summary.differences} {summary.differences === 1 ? 'Difference' : 'Differences'}</span>
          <span className="bad">✕ {summary.missing} Missing</span>
          <span className="ok">✓ {summary.resolved} Resolved</span>
        </div>
      </article>

      <div className="recon-filters" role="tablist" aria-label="Reconciliation filters">
        {RECON_FILTERS.map((entry) => {
          const count = filterCount(summary, entry.id);
          const mark = entry.id === 'matched' || entry.id === 'resolved'
            ? '✓ '
            : entry.id === 'differences'
              ? '⚠ '
              : entry.id === 'missing'
                ? '✕ '
                : '';
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={filter === entry.id}
              className={filter === entry.id ? 'active' : ''}
              onClick={() => setFilter(entry.id)}
            >
              {mark}{entry.label} {count}
            </button>
          );
        })}
      </div>

      <div className={`recon-workspace${selected !== null ? ' has-selection' : ''}`}>
        <div className="recon-board">
          <div className="recon-cols" aria-hidden="true">
            <span>External transaction</span>
            <span />
            <span>Kanakku transaction</span>
            <span />
          </div>
          <div className="recon-rows" role="list">
            {rows.map((item) => {
              const tone = statusTone(item.status);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`recon-row${selected?.id === item.id ? ' focus' : ''} ${tone}`}
                  onClick={() => select(item)}
                >
                  <span className="recon-side">
                    <b>{item.external?.counterparty ?? '—'}</b>
                    <em>{item.external !== null ? rupee(item.external.amount) : '—'}</em>
                  </span>
                  <span className="recon-join" aria-hidden="true">↔</span>
                  <span className="recon-side">
                    <b>{item.kanakku !== null ? partyLabel(item.kanakku) : '—'}</b>
                    <em>{item.kanakku !== null ? rupee(item.kanakku.amount) : '—'}</em>
                    {item.status === 'DIFFERENCE' && item.difference !== null ? (
                      <small>Difference {rupee(Math.abs(item.difference))}</small>
                    ) : null}
                    {item.status === 'RESOLVED' && item.resolutionReason !== null ? (
                      <small>Resolved · {item.resolutionReason}</small>
                    ) : null}
                  </span>
                  <span className={`recon-status ${tone}`}>
                    <strong>{statusMark(item.status)}</strong>
                    <small>{statusLabel(item.status)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {selected !== null ? (
          <ReconInspector
            item={selected}
            snapshot={props.snapshot}
            resolving={resolving}
            reason={reason}
            onReason={setReason}
            onStartResolve={() => setResolving(true)}
            onCancelResolve={() => {
              setResolving(false);
              setReason('');
            }}
            onResolve={markResolved}
            onOpenTransaction={props.onOpenTransaction}
            onOpenJournal={props.onOpenJournal}
            onSendToEngine={props.onSendToEngine}
          />
        ) : null}
      </div>
    </section>
  );
}

function ReconInspector(props: {
  item: ReconciliationItem;
  snapshot: EngineSnapshot;
  resolving: boolean;
  reason: string;
  onReason: (value: string) => void;
  onStartResolve: () => void;
  onCancelResolve: () => void;
  onResolve: (event: FormEvent) => void;
  onOpenTransaction: (eventId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onSendToEngine: (merchant: string, amount: number, type: EngineEventType) => void;
}): JSX.Element {
  const item = props.item;
  const live = liveTransactionFor(props.snapshot, item);
  const journalId = liveJournalIdFor(props.snapshot, item) ?? live?.journalId ?? null;
  const lines = item.kanakku?.lines ?? [];
  const canResolve = item.status === 'DIFFERENCE' || item.status === 'MISSING_IN_KANAKKU' || item.status === 'MISSING_EXTERNALLY';
  const tone = statusTone(item.status);

  return (
    <aside className="recon-inspector" aria-label="Reconciliation detail">
      <div className="recon-kicker">Inspect</div>
      <h2>{itemTitle(item)}</h2>

      <div className="recon-compare">
        <section id="recon-external">
          <div className="recon-kicker">External</div>
          {item.external !== null ? (
            <>
              <b>{item.external.description}</b>
              <em>{rupee(item.external.amount)}</em>
              <small>{formatReconDay(item.external.date)}</small>
              {item.external.reference !== null ? <small>{item.external.reference}</small> : null}
            </>
          ) : (
            <p className="recon-empty">✕ No matching transaction</p>
          )}
        </section>
        <section>
          <div className="recon-kicker">Kanakku</div>
          {item.kanakku !== null ? (
            <>
              <b>{item.kanakku.description}</b>
              <em>{rupee(item.kanakku.amount)}</em>
              <small>{formatReconDay(item.kanakku.date)}</small>
              {item.kanakku.reference !== null ? <small>{item.kanakku.reference}</small> : null}
            </>
          ) : (
            <p className="recon-empty">✕ No accounting transaction</p>
          )}
        </section>
      </div>

      {item.status === 'DIFFERENCE' && item.difference !== null ? (
        <div className="recon-diff">
          <div className="recon-kicker">Difference</div>
          <b>{rupee(Math.abs(item.difference))}</b>
        </div>
      ) : null}

      <div className={`recon-result ${tone}`}>
        <div className="recon-kicker">Match result</div>
        <b>{statusMark(item.status)} {item.status === 'DIFFERENCE' ? 'NEEDS REVIEW' : statusLabel(item.status)}</b>
        {item.status === 'RESOLVED' && item.resolutionReason !== null ? (
          <p>Reason: {item.resolutionReason}</p>
        ) : null}
      </div>

      {lines.length > 0 ? (
        <div className="recon-journal">
          <div className="recon-kicker">Accounting</div>
          {lines.map((line, index) => (
            <div key={`${line.accountCode}-${index}`} className="recon-journal-line">
              <span>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName}</span>
              <em>{rupee(line.amount)}</em>
            </div>
          ))}
        </div>
      ) : null}

      <p className="recon-note">“{reconCommentary(item)}”</p>

      <div className="recon-actions">
        {item.external !== null ? (
          <button
            className="btn tiny ghost"
            type="button"
            onClick={() => document.getElementById('recon-external')?.scrollIntoView({ block: 'nearest' })}
          >
            View external transaction
          </button>
        ) : null}
        {live !== undefined ? (
          <button className="btn tiny ghost" type="button" onClick={() => props.onOpenTransaction(live.eventId)}>
            View transaction
          </button>
        ) : null}
        {journalId !== null ? (
          <button className="btn tiny ghost" type="button" onClick={() => props.onOpenJournal(journalId)}>
            View journal
          </button>
        ) : null}
        {item.status === 'MISSING_IN_KANAKKU' && item.external !== null ? (
          <button
            className="btn tiny"
            type="button"
            onClick={() => props.onSendToEngine(
              item.external!.counterparty,
              item.external!.amount,
              toEngineEventType(item.external!.type)
            )}
          >
            Send to Engine
          </button>
        ) : null}
        {canResolve && !props.resolving ? (
          <button className="btn tiny green" type="button" onClick={props.onStartResolve}>Resolve</button>
        ) : null}
      </div>

      {props.resolving ? (
        <form className="recon-resolve" onSubmit={props.onResolve}>
          <label>
            Reason
            <input
              value={props.reason}
              onChange={(event) => props.onReason(event.target.value)}
              placeholder="₹40 service charge."
              autoFocus
            />
          </label>
          <div className="recon-actions">
            <button className="btn tiny ghost" type="button" onClick={props.onCancelResolve}>Cancel</button>
            <button className="btn tiny green" type="submit" disabled={props.reason.trim().length === 0}>
              Mark resolved
            </button>
          </div>
        </form>
      ) : null}
    </aside>
  );
}
