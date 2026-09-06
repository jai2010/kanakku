'use client';

import { KeyboardEvent, useState } from 'react';
import {
  EngineEventType,
  EngineParticipantLedgerView,
  EngineSnapshot,
  EngineTransactionView,
  formatLedgerDate,
  rupee,
  signedRupee,
  typeLabel
} from './engine-types';
import {
  ParticipantKindFilter,
  TX_KIND_FILTERS,
  TransactionsPane,
  TxKindFilter,
  filterActivityTransactions,
  filterParticipants,
  matchesParticipantQuery,
  participantBalanceLabel,
  participantCounts,
  participantTypeLabel
} from './transactions-model';

export function TransactionsPanel(props: {
  snapshot: EngineSnapshot;
  selectedTransactionId: string | null;
  selectedParticipantId: string | null;
  ruleFilter?: string | null;
  onSelectTransaction: (eventId: string | null) => void;
  onSelectParticipant: (accountId: string | null) => void;
  onOpenTransaction: (eventId: string) => void;
  onOpenParticipant: (accountId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onOpenAccount: (accountId: string) => void;
  onViewTransformation: (ruleId: string | null, eventId?: string | null) => void;
  onViewInEngine: (eventId: string) => void;
  onTeachSutra: (merchant: string, type: EngineEventType) => void;
  onClearRuleFilter?: () => void;
}): JSX.Element {
  const snapshot = props.snapshot;
  const [pane, setPane] = useState<TransactionsPane>('activity');
  const selectedTransaction = snapshot.transactions.find((row) => row.eventId === props.selectedTransactionId);
  const selectedParticipant = snapshot.participantLedgers.find((row) => row.accountId === props.selectedParticipantId);
  const counts = participantCounts(snapshot.participants);

  return (
    <section className="panel page-panel ledger-page">
      <div className="ledger-head">
        <div>
          <h2>Transactions</h2>
          <div className="sub">What happened — operational balances and the financial books they produce</div>
        </div>
      </div>
      {selectedParticipant !== undefined ? (
        <ParticipantAccountPage
          snapshot={snapshot}
          ledger={selectedParticipant}
          fromTransaction={selectedTransaction}
          onBack={() => {
            props.onSelectParticipant(null);
            if (selectedTransaction === undefined) {
              setPane('participants');
            }
          }}
          onOpenTransaction={props.onOpenTransaction}
          onViewInEngine={props.onViewInEngine}
          onOpenJournal={props.onOpenJournal}
          onOpenAccount={props.onOpenAccount}
        />
      ) : selectedTransaction !== undefined ? (
        <TransactionDetail
          snapshot={snapshot}
          transaction={selectedTransaction}
          onBack={() => {
            props.onSelectTransaction(null);
            setPane('activity');
          }}
          onOpenParticipant={props.onOpenParticipant}
          onOpenJournal={props.onOpenJournal}
          onOpenAccount={props.onOpenAccount}
          onViewTransformation={props.onViewTransformation}
          onViewInEngine={props.onViewInEngine}
          onTeachSutra={() => props.onTeachSutra(selectedTransaction.counterparty, selectedTransaction.type)}
        />
      ) : (
        <div className="ledger-body tx-home">
          <div className="tx-switch" role="tablist" aria-label="Transactions views">
            <button
              type="button"
              role="tab"
              aria-selected={pane === 'activity'}
              className={pane === 'activity' ? 'capsule' : 'text'}
              onClick={() => setPane('activity')}
            >
              Activity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pane === 'participants'}
              className={`text${pane === 'participants' ? ' current' : ''}`}
              onClick={() => setPane('participants')}
            >
              Participants · {counts.buyers} {counts.buyers === 1 ? 'buyer' : 'buyers'} · {counts.sellers} {counts.sellers === 1 ? 'seller' : 'sellers'}
            </button>
          </div>
          {pane === 'participants' ? (
            <ParticipantsDirectory snapshot={snapshot} onOpen={props.onOpenParticipant} />
          ) : (
            <ActivityHome
              snapshot={snapshot}
              ruleFilter={props.ruleFilter}
              onClearRuleFilter={props.onClearRuleFilter}
              onOpen={props.onOpenTransaction}
              onOpenParticipant={props.onOpenParticipant}
            />
          )}
        </div>
      )}
    </section>
  );
}

function ActivityHome(props: {
  snapshot: EngineSnapshot;
  ruleFilter?: string | null;
  onClearRuleFilter?: () => void;
  onOpen: (eventId: string) => void;
  onOpenParticipant: (accountId: string) => void;
}): JSX.Element {
  const [kind, setKind] = useState<TxKindFilter>('ALL');
  const [query, setQuery] = useState('');
  const rows = filterActivityTransactions(props.snapshot.transactions, {
    kind,
    query,
    ruleFilter: props.ruleFilter
  });
  const matchingPeople = query.trim().length === 0
    ? []
    : props.snapshot.participants.filter((row) => matchesParticipantQuery(row, query));

  return (
    <>
      <div className="tx-kind-tabs" role="tablist" aria-label="Transaction kinds">
        {TX_KIND_FILTERS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            className={kind === id ? 'active' : ''}
            onClick={() => setKind(id)}
          >
            {id === 'ALL' ? 'All' : id}
          </button>
        ))}
      </div>
      {props.ruleFilter ? (
        <div className="studio-context">
          Showing transactions for {props.ruleFilter}
          {props.onClearRuleFilter !== undefined ? (
            <button className="lineage-link" type="button" onClick={props.onClearRuleFilter}>Show all</button>
          ) : null}
        </div>
      ) : null}
      <div className="ledger-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search transactions, buyers, sellers..."
          aria-label="Search transactions, buyers, sellers"
        />
      </div>
      {matchingPeople.length > 0 ? (
        <div className="tx-search-hits">
          <span>Participants</span>
          {matchingPeople.slice(0, 8).map((row) => (
            <button key={row.accountId} type="button" className="lineage-link" onClick={() => props.onOpenParticipant(row.accountId)}>
              {row.name}
              <small> · {participantTypeLabel(row.kind)} · {rupee(row.balance)}</small>
            </button>
          ))}
        </div>
      ) : null}
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Participant</th>
              <th>Activity</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.eventId}
                tabIndex={0}
                role="button"
                onClick={() => props.onOpen(row.eventId)}
                onKeyDown={activateRow(() => props.onOpen(row.eventId))}
              >
                <td>
                  <b className="mono">{row.displayId}</b>
                  <div className="meta">{formatLedgerDate(row.occurredAt)}</div>
                </td>
                <td>
                  <b>{row.participantName ?? row.counterparty}</b>
                  <div className="meta">{row.participantKind === null ? '—' : participantTypeLabel(row.participantKind)}</div>
                </td>
                <td>{typeLabel(row.type)}</td>
                <td className="num">{rupee(row.amount)}</td>
                <td><span className={`tx-pill ${statusTone(row)}`}>{statusLabel(row)}</span></td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}><p className="sub">No transactions match.</p></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ParticipantsDirectory(props: {
  snapshot: EngineSnapshot;
  onOpen: (accountId: string) => void;
}): JSX.Element {
  const [kind, setKind] = useState<ParticipantKindFilter>('ALL');
  const [query, setQuery] = useState('');
  const rows = filterParticipants(props.snapshot.participants, { kind, query });

  return (
    <>
      <div className="tx-kind-tabs" role="tablist" aria-label="Participant kinds">
        {([['ALL', 'All'], ['BUYER', 'Buyers'], ['SELLER', 'Sellers']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={kind === id}
            className={kind === id ? 'active' : ''}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ledger-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search buyers or sellers..."
          aria-label="Search buyers or sellers"
        />
      </div>
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Type</th>
              <th className="num">Balance / Payable</th>
              <th className="num">Activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.accountId}
                tabIndex={0}
                role="button"
                onClick={() => props.onOpen(row.accountId)}
                onKeyDown={activateRow(() => props.onOpen(row.accountId))}
              >
                <td>
                  <b>{row.name}</b>
                  <div className="meta">{row.participantId}</div>
                </td>
                <td>{participantTypeLabel(row.kind)}</td>
                <td className="num">
                  <b>{rupee(row.balance)}</b>
                  <div className="meta">{participantBalanceLabel(row.kind)}</div>
                </td>
                <td className="num">{row.entryCount}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}><p className="sub">No participants match.</p></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TransactionDetail(props: {
  snapshot: EngineSnapshot;
  transaction: EngineTransactionView;
  onBack: () => void;
  onOpenParticipant: (accountId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onOpenAccount: (accountId: string) => void;
  onViewTransformation: (ruleId: string | null, eventId?: string | null) => void;
  onViewInEngine: (eventId: string) => void;
  onTeachSutra: () => void;
}): JSX.Element {
  const tx = props.transaction;
  const journal = props.snapshot.ledger.find((entry) => entry.eventId === tx.eventId);
  const rule = props.snapshot.rules.find((row) => row.displayId === tx.selectedRule);
  const participant = props.snapshot.participantLedgers.find((row) =>
    row.participantId === tx.participantId && row.kind === tx.participantKind
  );
  const composition = tx.composition;

  return (
    <div className="tx-workspace">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onBack}>Transactions</button>
        <span>/</span>
        <span>{tx.displayId}</span>
      </nav>
      <header className="tx-hero">
        <div>
          <div className="trial-kicker">{typeLabel(tx.type)}</div>
          <h2>{tx.participantName ?? tx.counterparty}</h2>
          <div className="sub">
            {tx.orderId !== null ? `Order ${tx.orderId} · ` : ''}
            {tx.displayId} · {formatLedgerDate(tx.occurredAt)}
          </div>
        </div>
        <div className="tx-hero-amount">
          <b>{rupee(tx.amount)}</b>
          <span className={`tx-pill ${statusTone(tx)}`}>{statusLabel(tx)}</span>
        </div>
      </header>
      <div className="tx-pipe" aria-label="Lifecycle">
        <PipeStage state="done" kicker="Captured" title="Business event received" />
        <PipeStage
          state={tx.tracked ? 'done' : 'idle'}
          kicker="Transactional"
          title={tx.tracked ? `${tx.effects.length} operational entries` : 'Financial only'}
        />
        <PipeStage
          state={tx.pipeline.accounted ? 'done' : tx.pipeline.failed || tx.pipeline.unmatched ? 'warn' : 'idle'}
          kicker={tx.pipeline.accounted ? 'Accounted' : tx.pipeline.failed ? 'Failed' : 'Unmatched'}
          title={tx.journalDisplayId ?? 'No journal'}
        />
      </div>
      <div className="tx-split">
        <section className="tx-card">
          <div className="trial-kicker">What happened</div>
          <dl className="tx-facts">
            <div>
              <dt>{tx.participantKind === 'SELLER' ? 'Seller' : tx.participantKind === 'BUYER' ? 'Buyer' : 'Counterparty'}</dt>
              <dd>
                {participant !== undefined ? (
                  <button className="lineage-link" type="button" onClick={() => props.onOpenParticipant(participant.accountId)}>
                    {tx.participantName ?? tx.counterparty}
                  </button>
                ) : (tx.participantName ?? tx.counterparty)}
              </dd>
            </div>
            <div><dt>Activity</dt><dd>{typeLabel(tx.type)}</dd></div>
            {tx.orderId !== null ? <div><dt>Order</dt><dd>{tx.orderId}</dd></div> : null}
            <div><dt>Gross amount</dt><dd>{rupee(tx.amount)}</dd></div>
          </dl>
        </section>
        {composition !== null ? (
          <section className="tx-card">
            <div className="trial-kicker">{tx.participantKind === 'SELLER' ? 'Eligible payout' : 'Wallet'}</div>
            <div className="tx-jl">
              {composition.lines.map((line) => (
                <div className="row" key={`${line.type}-${line.description}`}>
                  <span>{line.description}</span>
                  <b>{signedRupee(line.signedAmount)}</b>
                </div>
              ))}
              <div className="row tx-total">
                <span>{tx.participantKind === 'SELLER' ? 'Eligible payout' : 'Balance after this'}</span>
                <b>{rupee(composition.total)}</b>
              </div>
            </div>
            {participant !== undefined ? (
              <button className="lineage-link" type="button" onClick={() => props.onOpenParticipant(participant.accountId)}>
                Open {participant.kind === 'SELLER' ? 'seller' : 'buyer'} account
              </button>
            ) : null}
          </section>
        ) : (
          <section className="tx-card">
            <div className="trial-kicker">Operational balance</div>
            <p className="sub">This activity is financial accounting only — no buyer or seller wallet is updated.</p>
          </section>
        )}
      </div>
      <section className="tx-card">
        <div className="trial-kicker">Accounting</div>
        {journal !== undefined ? (
          <>
            {composition !== null && tx.participantKind === 'SELLER' && tx.type === 'MARKETPLACE_SALE' ? (
              <p className="tx-gl-balance">Seller Payable {rupee(composition.total)}</p>
            ) : null}
            <div className="tx-jl">
              {journal.lines.map((line) => (
                <div className="row" key={`${line.accountCode}-${line.debit}-${line.credit}`}>
                  <span>{line.debit > 0 ? 'DR' : 'CR'} {line.accountName}</span>
                  <b>{rupee(line.debit > 0 ? line.debit : line.credit)}</b>
                </div>
              ))}
            </div>
            <div className={`balance-ok${journal.balanced ? '' : ' warn'}`}>
              <span>{journal.balanced ? 'Balanced' : 'Needs review'}</span>
              <span>{rupee(journal.totalDebits)} = {rupee(journal.totalCredits)}</span>
            </div>
          </>
        ) : (
          <p className="sub">Nothing posted to the accounting ledger.</p>
        )}
      </section>
      <div className="lineage-actions">
        {tx.selectedRule !== null ? (
          <button className="btn tiny" type="button" onClick={() => props.onViewTransformation(tx.selectedRule, tx.eventId)}>
            View Transformation
          </button>
        ) : (
          <button className="btn tiny" type="button" onClick={props.onTeachSutra}>Teach Kanakku</button>
        )}
        <button className="btn tiny" type="button" onClick={() => props.onViewInEngine(tx.eventId)}>View in Engine</button>
        {tx.journalId !== null ? (
          <button className="btn tiny" type="button" onClick={() => props.onOpenJournal(tx.journalId as string)}>View in Ledger</button>
        ) : null}
        {rule !== undefined ? (
          <span className="meta">{rule.displayId} {rule.name}</span>
        ) : null}
      </div>
    </div>
  );
}

function ParticipantAccountPage(props: {
  snapshot: EngineSnapshot;
  ledger: EngineParticipantLedgerView;
  fromTransaction: EngineTransactionView | undefined;
  onBack: () => void;
  onOpenTransaction: (eventId: string) => void;
  onViewInEngine: (eventId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onOpenAccount: (accountId: string) => void;
}): JSX.Element {
  const ledger = props.ledger;
  const seller = ledger.kind === 'SELLER';
  const latest = ledger.entries[ledger.entries.length - 1];
  const latestTx = latest === undefined
    ? undefined
    : props.snapshot.transactions.find((row) => row.eventId === latest.businessEventId);
  const payable = props.snapshot.accountBalances.find((row) => row.code === (seller ? '2110' : '2300'));

  return (
    <div className="activity-pane">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onBack}>
          {props.fromTransaction !== undefined ? props.fromTransaction.displayId : 'Participants'}
        </button>
        <span>/</span>
        <span>{ledger.name}</span>
      </nav>
      <div className="account-hero">
        <div>
          <div className="trial-kicker">{seller ? 'Seller' : 'Buyer'} · {ledger.participantId}</div>
          <h2>{ledger.name}</h2>
        </div>
        <div className="account-balance">
          <small>{participantBalanceLabel(ledger.kind)}</small>
          <b>{rupee(ledger.balance)}</b>
        </div>
      </div>
      <section className="tx-card">
        <div className="trial-kicker">Activity</div>
        <div className="table-wrap ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Event</th>
                <th className="num">Amount</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((entry) => (
                <tr
                  key={entry.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onOpenTransaction(entry.businessEventId)}
                  onKeyDown={activateRow(() => props.onOpenTransaction(entry.businessEventId))}
                >
                  <td>{formatLedgerDate(entry.effectiveAt)}</td>
                  <td>
                    {entry.description}
                    <div className="meta">{entry.transactionDisplayId ?? entry.type}</div>
                  </td>
                  <td className="num">{signedRupee(entry.signedAmount)}</td>
                  <td className="num">{rupee(entry.runningBalance)}</td>
                </tr>
              ))}
              {ledger.entries.length === 0 ? (
                <tr>
                  <td colSpan={4}><p className="sub">No operational entries yet.</p></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      {seller ? (
        <section className="tx-card">
          <div className="trial-kicker">Accounting</div>
          <p className="tx-gl-balance">Seller Payable {rupee(ledger.balance)}</p>
          {payable !== undefined ? (
            <button className="lineage-link" type="button" onClick={() => props.onOpenAccount(payable.accountId)}>
              View in Ledger
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="lineage-actions">
        {latest !== undefined ? (
          <button className="btn tiny" type="button" onClick={() => props.onOpenTransaction(latest.businessEventId)}>
            View Transaction
          </button>
        ) : null}
        {latest !== undefined ? (
          <button className="btn tiny" type="button" onClick={() => props.onViewInEngine(latest.businessEventId)}>
            View in Engine
          </button>
        ) : null}
        {latestTx?.journalId !== null && latestTx !== undefined ? (
          <button className="btn tiny" type="button" onClick={() => props.onOpenJournal(latestTx.journalId as string)}>
            View in Ledger
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PipeStage(props: { state: 'done' | 'warn' | 'idle'; kicker: string; title: string }): JSX.Element {
  return (
    <div className={`pipe-stage ${props.state}`}>
      <span className="pipe-dot" />
      <b>{props.kicker}</b>
      <small>{props.title}</small>
    </div>
  );
}

function statusLabel(tx: EngineTransactionView): string {
  if (tx.tracked && tx.pipeline.accounted) {
    return 'Tracked + Accounted';
  }
  if (tx.pipeline.accounted) {
    return 'Accounted';
  }
  if (tx.tracked) {
    return 'Tracked';
  }
  if (tx.pipeline.failed) {
    return 'Failed';
  }
  return 'Captured';
}

function statusTone(tx: EngineTransactionView): string {
  if (tx.pipeline.failed) {
    return 'warn';
  }
  if (tx.pipeline.accounted || tx.tracked) {
    return 'ok';
  }
  return '';
}

function activateRow(action: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}
