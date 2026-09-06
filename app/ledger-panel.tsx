'use client';

import { Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  EngineAccountBalanceView,
  EngineAccountType,
  EngineEventType,
  EngineLedgerEntryView,
  EngineLedgerPane,
  EngineSnapshot,
  EngineTransactionView,
  accountTypeLabel,
  formatAsOf,
  formatBalance,
  formatLedgerDate,
  formatMoneyCell,
  rupee,
  typeLabel
} from './engine-types';

const TYPE_FILTERS: Array<{ id: 'ALL' | EngineAccountType; label: string }> = [
  { id: 'ALL', label: 'All types' },
  { id: 'ASSET', label: 'Assets' },
  { id: 'LIABILITY', label: 'Liabilities' },
  { id: 'EXPENSE', label: 'Expenses' },
  { id: 'INCOME', label: 'Income' },
  { id: 'EQUITY', label: 'Equity' }
];

export function LedgerPanel(props: {
  snapshot: EngineSnapshot;
  surface?: 'ledger' | 'transactions';
  pane: EngineLedgerPane;
  selectedAccountId: string | null;
  selectedJournalId: string | null;
  selectedTransactionId: string | null;
  highlightAccountIds: string[];
  highlightJournalId: string | null;
  onPane: (pane: EngineLedgerPane) => void;
  onSelectAccount: (accountId: string | null) => void;
  onSelectJournal: (journalId: string | null) => void;
  onSelectTransaction: (eventId: string | null) => void;
  onOpenAccount: (accountId: string) => void;
  onOpenJournal: (journalId: string) => void;
  onOpenTransaction: (eventId: string) => void;
  onViewTransformation: (ruleId: string | null, eventId?: string | null) => void;
  onTeachSutra: (merchant: string, type: EngineEventType) => void;
  onViewInEngine: (eventId: string) => void;
  transactionRuleFilter?: string | null;
  onClearTransactionFilter?: () => void;
}): JSX.Element {
  const snapshot = props.snapshot;
  const surface = props.surface ?? 'ledger';
  const selectedAccount = snapshot.accountLedgers.find((ledger) => ledger.accountId === props.selectedAccountId);
  const selectedJournal = snapshot.ledger.find((entry) => entry.journalId === props.selectedJournalId);
  const selectedTransaction = snapshot.transactions.find((row) => row.eventId === props.selectedTransactionId);
  const showingTransactions = surface === 'transactions';

  return (
    <section className="panel page-panel ledger-page">
      <div className="ledger-head">
        <div>
          <h2>{showingTransactions ? 'Transactions' : 'Ledger'}</h2>
          <div className="sub">{showingTransactions ? 'What happened' : 'What was posted'}</div>
        </div>
        <div className="ledger-asof">{formatAsOf(snapshot.ledgerTotals.to ?? snapshot.ledgerTotals.asOf)}</div>
      </div>
      {showingTransactions ? null : (
      <div className="ledger-tabs" role="tablist" aria-label="Ledger views">
        {([['overview', 'Overview'], ['accounts', 'Accounts'], ['journals', 'Journals'], ['trial', 'Trial Balance']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={props.pane === id}
            className={props.pane === id ? 'active' : ''}
            onClick={() => props.onPane(id)}
          >
            {label}
          </button>
        ))}
      </div>
      )}
      {props.pane === 'overview' ? (
        <LedgerOverview
          totals={snapshot.ledgerTotals}
          balances={snapshot.accountBalances}
          asOf={snapshot.ledgerTotals.to ?? snapshot.ledgerTotals.asOf}
          onOpenAccount={props.onOpenAccount}
        />
      ) : null}
      {showingTransactions ? (
        selectedTransaction !== undefined ? (
          <TransactionDetail
            transaction={selectedTransaction}
            journal={snapshot.ledger.find((entry) => entry.eventId === selectedTransaction.eventId)}
            rule={snapshot.rules.find((rule) => rule.displayId === selectedTransaction.selectedRule)}
            accounts={snapshot.accountBalances}
            onBack={() => props.onSelectTransaction(null)}
            onViewInEngine={() => props.onViewInEngine(selectedTransaction.eventId)}
            onViewTransformation={() => props.onViewTransformation(selectedTransaction.selectedRule, selectedTransaction.eventId)}
            onViewJournal={() => {
              if (selectedTransaction.journalId !== null) {
                props.onOpenJournal(selectedTransaction.journalId);
              }
            }}
            onOpenAccount={props.onOpenAccount}
            onTeachSutra={() => props.onTeachSutra(selectedTransaction.counterparty, selectedTransaction.type)}
          />
        ) : (
          <TransactionsTable
            transactions={
              props.transactionRuleFilter === undefined || props.transactionRuleFilter === null
                ? snapshot.transactions
                : snapshot.transactions.filter((row) => row.selectedRule === props.transactionRuleFilter)
            }
            filterLabel={
              props.transactionRuleFilter === undefined || props.transactionRuleFilter === null
                ? null
                : props.transactionRuleFilter
            }
            onClearFilter={props.onClearTransactionFilter}
            onOpen={props.onOpenTransaction}
          />
        )
      ) : null}
      {props.pane === 'accounts' ? (
        <div className={`gl-split${selectedAccount !== undefined || selectedJournal !== undefined ? ' has-selection' : ''}`}>
          <div className="gl-accounts">
            <AccountsTable
              balances={snapshot.accountBalances}
              selectedAccountId={props.selectedAccountId}
              highlightAccountIds={props.highlightAccountIds}
              onOpen={props.onOpenAccount}
            />
          </div>
          <div className="gl-activity">
            {selectedJournal !== undefined ? (
              <JournalDetail
                entry={selectedJournal}
                accountName={selectedAccount?.name}
                accounts={snapshot.accountBalances}
                onBack={() => props.onSelectJournal(null)}
                onHome={() => {
                  props.onSelectJournal(null);
                  props.onSelectAccount(null);
                }}
                onOpenAccount={props.onOpenAccount}
                onViewInEngine={() => props.onViewInEngine(selectedJournal.eventId)}
                onViewTransaction={() => props.onOpenTransaction(selectedJournal.eventId)}
                onViewTransformation={() => {
                  const tx = snapshot.transactions.find((row) => row.eventId === selectedJournal.eventId);
                  props.onViewTransformation(tx?.selectedRule ?? selectedJournal.selectedRule, selectedJournal.eventId);
                }}
              />
            ) : selectedAccount !== undefined ? (
              <AccountLedger
                ledger={selectedAccount}
                highlightJournalId={props.highlightJournalId}
                justPosted={props.highlightAccountIds.includes(selectedAccount.accountId)}
                onHome={() => props.onSelectAccount(null)}
                onOpenJournal={(journalId) => props.onSelectJournal(journalId)}
              />
            ) : (
              <p className="sub activity-empty">Select an account to see its ledger.</p>
            )}
          </div>
        </div>
      ) : null}
      {props.pane === 'journals' ? (
        selectedJournal !== undefined ? (
          <JournalDetail
            entry={selectedJournal}
            accounts={snapshot.accountBalances}
            onBack={() => props.onSelectJournal(null)}
            onHome={() => props.onSelectJournal(null)}
            onOpenAccount={props.onOpenAccount}
            onViewInEngine={() => props.onViewInEngine(selectedJournal.eventId)}
            onViewTransaction={() => props.onOpenTransaction(selectedJournal.eventId)}
            onViewTransformation={() => {
              const tx = snapshot.transactions.find((row) => row.eventId === selectedJournal.eventId);
              props.onViewTransformation(tx?.selectedRule ?? selectedJournal.selectedRule, selectedJournal.eventId);
            }}
          />
        ) : (
          <JournalsTable
            entries={snapshot.ledger}
            highlightJournalId={props.highlightJournalId}
            onOpen={(journalId) => props.onSelectJournal(journalId)}
          />
        )
      ) : null}
      {props.pane === 'trial' ? (
        <TrialBalanceView trial={snapshot.trialBalance} onOpenAccount={props.onOpenAccount} />
      ) : null}
    </section>
  );
}

function TransactionSummary(props: { transactions: EngineTransactionView[] }): JSX.Element {
  const rows = props.transactions;
  const accounted = rows.filter((row) => row.pipeline.accounted).length;
  const unmatched = rows.filter((row) => row.pipeline.unmatched).length;
  const failed = rows.filter((row) => row.pipeline.failed).length;
  const charges = rows.reduce((sum, row) => sum + row.amount, 0);
  const pct = rows.length === 0 ? 100 : Math.round((accounted / rows.length) * 1000) / 10;
  return (
    <div className="tx-metrics">
      <TxMetric value={String(rows.length)} label="Transactions" />
      <TxMetric value={rupee(charges)} label="Charges" />
      <TxMetric value={String(accounted)} label="Accounted" />
      <TxMetric value={String(unmatched)} label="Unmatched" tone={unmatched > 0 ? 'warn' : undefined} />
      <TxMetric value={String(failed)} label="Failed" tone={failed > 0 ? 'warn' : undefined} />
      <TxMetric value={`${pct}%`} label="Accounted" tone={pct === 100 ? 'ok' : undefined} />
    </div>
  );
}

function TxMetric(props: { value: string; label: string; tone?: 'ok' | 'warn' }): JSX.Element {
  return (
    <div className={`tx-metric${props.tone !== undefined ? ` ${props.tone}` : ''}`}>
      <b>{props.value}</b>
      <small>{props.label}</small>
    </div>
  );
}

const CLASS_ORDER: EngineAccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

function LedgerOverview(props: {
  totals: EngineSnapshot['ledgerTotals'];
  balances: EngineAccountBalanceView[];
  asOf: string | null;
  onOpenAccount: (accountId: string) => void;
}): JSX.Element {
  const totals = props.totals;
  const [open, setOpen] = useState<Partial<Record<EngineAccountType, boolean>>>({});
  function toggle(type: EngineAccountType): void {
    setOpen((current) => ({ ...current, [type]: current[type] !== true }));
  }
  return (
    <div className="ledger-body folio">
      <div className="folio-head">
        <div>
          <div className="trial-kicker">General ledger</div>
          <div className="sub">{formatAsOf(props.asOf)}</div>
        </div>
        <div className={totals.balanced ? 'ok' : 'warn'}>
          {totals.accountCount} accounts · {rupee(totals.totalDebits)} DR · {rupee(totals.totalCredits)} CR
        </div>
      </div>
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {CLASS_ORDER.map((type) => {
              const rows = props.balances.filter((row) => row.type === type);
              const classTotal = totals.typeTotals.find((row) => row.type === type);
              const debit = classTotal?.balanceSide === 'DEBIT' ? classTotal.balance : 0;
              const credit = classTotal?.balanceSide === 'CREDIT' ? classTotal.balance : 0;
              const expanded = open[type] === true;
              return (
                <Fragment key={type}>
                  <tr
                    className={`class-row${expanded ? ' open' : ''}`}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(type)}
                    onKeyDown={activateRow(() => toggle(type))}
                  >
                    <td>
                      <span className="chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                      {accountClassLabel(type)}
                      <span className="meta"> · {rows.length}</span>
                    </td>
                    <td className="num">{formatMoneyCell(debit)}</td>
                    <td className="num">{formatMoneyCell(credit)}</td>
                  </tr>
                  {expanded && rows.length === 0 ? (
                    <tr className="quiet-row">
                      <td colSpan={3}><span className="meta">No accounts</span></td>
                    </tr>
                  ) : null}
                  {expanded ? rows.map((row) => (
                    <tr
                      key={row.accountId}
                      tabIndex={0}
                      role="button"
                      onClick={() => props.onOpenAccount(row.accountId)}
                      onKeyDown={activateRow(() => props.onOpenAccount(row.accountId))}
                    >
                      <td>
                        <span className="mono meta">{row.code}</span>
                        {' '}
                        <b>{row.name}</b>
                      </td>
                      <td className="num">{row.balanceSide === 'DEBIT' ? formatMoneyCell(row.balance) : '—'}</td>
                      <td className="num">{row.balanceSide === 'CREDIT' ? formatMoneyCell(row.balance) : '—'}</td>
                    </tr>
                  )) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>{totals.balanced ? 'Total · Ledger balanced' : 'Total · Out of balance'}</th>
              <th className="num">{rupee(totals.totalDebits)}</th>
              <th className="num">{rupee(totals.totalCredits)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function OverviewRow(props: { label: string; total: EngineSnapshot['ledgerTotals']['typeTotals'][number] | undefined }): JSX.Element {
  const total = props.total;
  const text = total === undefined
    ? formatBalance(0, 'DEBIT')
    : formatBalance(total.balance, total.balanceSide);
  return (
    <div className="overview-row">
      <span>{props.label}</span>
      <b>{text}</b>
    </div>
  );
}

function AccountsTable(props: {
  balances: EngineAccountBalanceView[];
  selectedAccountId: string | null;
  highlightAccountIds: string[];
  onOpen: (accountId: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'ALL' | EngineAccountType>('ALL');
  const [currency, setCurrency] = useState('ALL');
  const currencies = useMemo(
    () => Array.from(new Set(props.balances.map((row) => row.currency))).sort(),
    [props.balances]
  );
  const showCurrency = currencies.length > 1;
  const rows = props.balances.filter((row) => {
    if (type !== 'ALL' && row.type !== type) {
      return false;
    }
    if (showCurrency && currency !== 'ALL' && row.currency !== currency) {
      return false;
    }
    if (query.trim().length === 0) {
      return true;
    }
    const hay = `${row.code} ${row.name} ${accountTypeLabel(row.type)}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  return (
    <div className="ledger-body">
      <div className="ledger-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts…" />
        <select value={type} onChange={(event) => setType(event.target.value as 'ALL' | EngineAccountType)}>
          {TYPE_FILTERS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        {showCurrency ? (
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="ALL">All currencies</option>
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        ) : null}
      </div>
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = props.selectedAccountId === row.accountId;
              const posted = props.highlightAccountIds.includes(row.accountId);
              return (
                <tr
                  key={`${row.accountId}-${row.currency}`}
                  className={`${selected ? 'focus' : ''}${posted ? ' just-posted' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  onClick={() => props.onOpen(row.accountId)}
                  onKeyDown={activateRow(() => props.onOpen(row.accountId))}
                >
                  <td>
                    <b>{row.name}</b>
                    <div className="meta">{accountTypeLabel(row.type)} · {row.code}</div>
                  </td>
                  <td className="num balance-cell">{formatBalance(row.balance, row.balanceSide)}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2}><p className="sub">No accounts match.</p></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountLedger(props: {
  ledger: EngineSnapshot['accountLedgers'][number];
  highlightJournalId: string | null;
  justPosted: boolean;
  onHome: () => void;
  onOpenJournal: (journalId: string) => void;
}): JSX.Element {
  const ledger = props.ledger;
  const highlightRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest' });
  }, [props.highlightJournalId, ledger.accountId]);

  return (
    <div className="activity-pane">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onHome}>Ledger</button>
        <span>/</span>
        <span>{ledger.name}</span>
      </nav>
      <div className="account-hero">
        <div>
          <h2>{ledger.name}</h2>
          <div className="sub">{accountTypeLabel(ledger.type)} · {ledger.code}</div>
        </div>
        <div className={`account-balance${props.justPosted ? ' glow' : ''}`}>
          <small>Current balance</small>
          <b>{formatBalance(ledger.balance, ledger.balanceSide)}</b>
        </div>
      </div>
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Description</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.entries.map((entry) => {
              const posted = entry.journalId === props.highlightJournalId;
              return (
                <tr
                  key={entry.id}
                  ref={posted ? highlightRef : undefined}
                  className={posted ? 'just-posted glow-row' : ''}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onOpenJournal(entry.journalId)}
                  onKeyDown={activateRow(() => props.onOpenJournal(entry.journalId))}
                >
                  <td>{formatLedgerDate(entry.transactionDate)}</td>
                  <td className="mono">{entry.journalDisplayId}</td>
                  <td>
                    {entry.merchant}
                    {entry.selectedRule !== null ? <div className="meta">{entry.selectedRule}</div> : null}
                  </td>
                  <td className="num">{formatMoneyCell(entry.debit)}</td>
                  <td className="num">{formatMoneyCell(entry.credit)}</td>
                  <td className="num">{formatBalance(entry.runningBalance, entry.runningBalanceSide)}</td>
                </tr>
              );
            })}
            {ledger.entries.length === 0 ? (
              <tr>
                <td colSpan={6}><p className="sub">No posted activity on this account yet.</p></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsTable(props: {
  transactions: EngineTransactionView[];
  filterLabel?: string | null;
  onClearFilter?: () => void;
  onOpen: (eventId: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const sources = useMemo(
    () => Array.from(new Set(props.transactions.map((row) => row.source))).sort(),
    [props.transactions]
  );
  const rows = props.transactions.filter((row) => {
    if (source !== 'ALL' && row.source !== source) {
      return false;
    }
    if (status === 'accounted' && !row.pipeline.accounted) {
      return false;
    }
    if (status === 'unmatched' && !row.pipeline.unmatched) {
      return false;
    }
    if (status === 'failed' && !row.pipeline.failed) {
      return false;
    }
    if (query.trim().length === 0) {
      return true;
    }
    const hay = `${row.displayId} ${row.source} ${row.description} ${row.category} ${typeLabel(row.type)}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  return (
    <div className="ledger-body">
      <TransactionSummary transactions={props.transactions} />
      {props.filterLabel !== undefined && props.filterLabel !== null ? (
        <div className="studio-context">
          Showing transactions for {props.filterLabel}
          {props.onClearFilter !== undefined ? (
            <button className="lineage-link" type="button" onClick={props.onClearFilter}>Show all</button>
          ) : null}
        </div>
      ) : null}
      <div className="ledger-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transactions…" />
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="ALL">All sources</option>
          {sources.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="accounted">Accounted</option>
          <option value="unmatched">Unmatched</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      {props.transactions.length === 0 ? (
        <p className="sub">No transactions yet. Run one through the engine — nothing is posted until you do.</p>
      ) : (
        <div className="table-wrap ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Type</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th>Accounting</th>
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
                  <td>{formatLedgerDate(row.occurredAt)}</td>
                  <td>{row.source}</td>
                  <td>{typeLabel(row.type)}</td>
                  <td>
                    {row.description}
                    <div className="meta">{row.displayId}</div>
                  </td>
                  <td className="num">{rupee(row.amount)}</td>
                  <td>
                    <span className={`tx-pill ${transactionTone(row)}`}>{transactionStatusLabel(row)}</span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}><p className="sub">No transactions match.</p></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TransactionDetail(props: {
  transaction: EngineTransactionView;
  journal: EngineLedgerEntryView | undefined;
  rule: EngineSnapshot['rules'][number] | undefined;
  accounts: EngineAccountBalanceView[];
  onBack: () => void;
  onViewInEngine: () => void;
  onViewTransformation: () => void;
  onViewJournal: () => void;
  onOpenAccount: (accountId: string) => void;
  onTeachSutra: () => void;
}): JSX.Element {
  const tx = props.transaction;
  const journal = props.journal;
  const rule = props.rule;
  const accounted = tx.pipeline.accounted;
  return (
    <div className="tx-workspace">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onBack}>Transactions</button>
        <span>/</span>
        <span>{tx.displayId}</span>
      </nav>
      <header className="tx-hero">
        <div>
          <h2>{tx.description}</h2>
          <div className="sub">{tx.displayId} · {typeLabel(tx.type)} · {formatLedgerDate(tx.occurredAt)}</div>
        </div>
        <div className="tx-hero-amount">
          <b>{rupee(tx.amount)}</b>
          <span className={`tx-pill ${transactionTone(tx)}`}>{transactionStatusLabel(tx)}</span>
        </div>
      </header>
      <AccountingPipe transaction={tx} />
      <div className="tx-split">
        <section className="tx-card">
          <div className="trial-kicker">What happened</div>
          {tx.usage !== null ? (
            <div className="tx-econ">
              <div>{tx.usage.quantity} {tx.usage.unit}</div>
              <div className="meta">× {rupee(tx.usage.unitPrice)} / {tx.usage.unit.replace(/s$/, '')}</div>
              <hr />
              <strong>{rupee(tx.amount)}</strong>
            </div>
          ) : null}
          <dl className="tx-facts">
            <div><dt>Source</dt><dd>{tx.source}</dd></div>
            <div><dt>Type</dt><dd>{typeLabel(tx.type)}</dd></div>
            <div><dt>Category</dt><dd>{tx.category}</dd></div>
            <div><dt>Amount</dt><dd>{rupee(tx.amount)}</dd></div>
            <div><dt>Currency</dt><dd>{tx.currency}</dd></div>
            {tx.usage !== null ? <div><dt>Meter</dt><dd>{tx.usage.meter}</dd></div> : null}
          </dl>
        </section>
        <div className="tx-stack">
          <section className="tx-card">
            <div className="trial-kicker">How Kanakku interpreted it</div>
            {rule !== undefined ? (
              <>
                <b className="tx-rule">{rule.displayId} {rule.name}</b>
                <div className="meta">DR {rule.debitName} · CR {rule.creditName}</div>
                <ul className="tx-checks">
                  <li className="ok">Matched</li>
                  <li className={journal?.balanced === true ? 'ok' : 'warn'}>{journal?.balanced === true ? 'Validated' : 'Held'}</li>
                  <li className={accounted ? 'ok' : 'warn'}>{accounted ? 'Posted' : 'Not posted'}</li>
                </ul>
              </>
            ) : (
              <>
                <p className="sub">No transformation matched this transaction.</p>
                <button className="btn tiny" type="button" onClick={props.onTeachSutra}>Teach Kanakku</button>
              </>
            )}
          </section>
          <section className="tx-card">
            <div className="trial-kicker">What was posted</div>
            {journal !== undefined ? (
              <>
                <button className="lineage-link" type="button" onClick={props.onViewJournal}>{journal.journalDisplayId}</button>
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
        </div>
      </div>
      <section className="tx-flow" aria-label="Accounting lineage">
        <LineageNode kicker="Transaction" title={tx.displayId} detail={rupee(tx.amount)} state="done" />
        <LineageNode
          kicker="Transformation"
          title={tx.selectedRule ?? '—'}
          detail={tx.selectedRuleName ?? 'Not matched'}
          state={tx.selectedRule !== null ? 'done' : 'warn'}
          onClick={tx.selectedRule !== null ? props.onViewTransformation : props.onTeachSutra}
        />
        <LineageNode
          kicker="Engine"
          title={accounted ? 'Executed' : 'Held'}
          detail={accounted ? 'Matched · validated' : 'Awaiting policy'}
          state={accounted ? 'done' : 'warn'}
          onClick={props.onViewInEngine}
        />
        <LineageNode
          kicker="Journal"
          title={tx.journalDisplayId ?? '—'}
          detail={journal !== undefined ? `DR ${rupee(journal.totalDebits)}` : 'Not posted'}
          state={accounted ? 'done' : 'idle'}
          onClick={journal !== undefined ? props.onViewJournal : undefined}
        />
        <LineageNode
          kicker="Ledger"
          title={accountNames(tx, props.accounts)}
          detail={accounted ? 'Balances updated' : 'No impact'}
          state={accounted ? 'done' : 'idle'}
          onClick={tx.accountCodes[0] !== undefined ? () => {
            const account = props.accounts.find((row) => row.code === tx.accountCodes[0]);
            if (account !== undefined) {
              props.onOpenAccount(account.accountId);
            }
          } : undefined}
        />
      </section>
      <div className="lineage-actions">
        {tx.selectedRule !== null ? (
          <button className="btn tiny" type="button" onClick={props.onViewTransformation}>View Transformation</button>
        ) : (
          <button className="btn tiny" type="button" onClick={props.onTeachSutra}>Teach Kanakku</button>
        )}
        <button className="btn tiny" type="button" onClick={props.onViewInEngine}>View in Engine</button>
        {tx.journalId !== null ? (
          <button className="btn tiny" type="button" onClick={props.onViewJournal}>View Journal</button>
        ) : null}
      </div>
    </div>
  );
}

function AccountingPipe(props: { transaction: EngineTransactionView }): JSX.Element {
  const tx = props.transaction;
  const third = tx.pipeline.accounted ? 'done' : tx.pipeline.unmatched || tx.pipeline.failed ? 'warn' : 'idle';
  return (
    <div className="tx-pipe" aria-label="Accounting lifecycle">
      <PipeStage state="done" kicker="Captured" title="Business event received" />
      <PipeStage
        state={tx.pipeline.rated ? 'done' : 'idle'}
        kicker="Rated"
        title={tx.usage !== null ? `${tx.usage.quantity} × ${rupee(tx.usage.unitPrice)}` : rupee(tx.amount)}
      />
      <PipeStage
        state={third}
        kicker={tx.pipeline.accounted ? 'Accounted' : tx.pipeline.failed ? 'Failed' : 'Unmatched'}
        title={tx.pipeline.accounted ? (tx.journalDisplayId ?? 'Journal posted') : tx.pipeline.failed ? 'Held in engine' : 'No transformation'}
      />
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

function LineageNode(props: {
  kicker: string;
  title: string;
  detail: string;
  state: 'done' | 'warn' | 'idle';
  onClick?: () => void;
}): JSX.Element {
  const inner = (
    <>
      <small>{props.kicker}</small>
      <b>{props.title}</b>
      <span>{props.detail}</span>
    </>
  );
  if (props.onClick !== undefined) {
    return (
      <button type="button" className={`tx-node ${props.state}`} onClick={props.onClick}>
        {inner}
      </button>
    );
  }
  return <div className={`tx-node ${props.state}`}>{inner}</div>;
}

function accountNames(tx: EngineTransactionView, accounts: EngineAccountBalanceView[]): string {
  const names = tx.accountCodes.map((code) => accounts.find((row) => row.code === code)?.name ?? code);
  if (names.length === 0) {
    return '—';
  }
  return names.join(' · ');
}

function transactionStatusLabel(row: EngineTransactionView): string {
  if (row.pipeline.accounted) {
    return '✓ Accounted';
  }
  if (row.pipeline.failed) {
    return '✕ Failed';
  }
  if (row.pipeline.unmatched) {
    return '⚠ Unmatched';
  }
  return 'Captured';
}

function transactionTone(row: EngineTransactionView): 'ok' | 'warn' | 'idle' {
  if (row.pipeline.accounted) {
    return 'ok';
  }
  if (row.pipeline.failed || row.pipeline.unmatched) {
    return 'warn';
  }
  return 'idle';
}

function JournalsTable(props: {
  entries: EngineLedgerEntryView[];
  highlightJournalId: string | null;
  onOpen: (journalId: string) => void;
}): JSX.Element {
  if (props.entries.length === 0) {
    return <p className="sub">Nothing posted yet. Run a transaction through the engine.</p>;
  }
  return (
    <div className="ledger-body">
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Journal</th>
              <th>Description</th>
              <th>Rule</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {props.entries.map((entry) => {
              const journalId = entry.journalId;
              if (journalId === null) {
                return null;
              }
              const posted = journalId === props.highlightJournalId;
              return (
                <tr
                  key={journalId}
                  className={posted ? 'just-posted' : ''}
                  tabIndex={0}
                  role="button"
                  onClick={() => props.onOpen(journalId)}
                  onKeyDown={activateRow(() => props.onOpen(journalId))}
                >
                  <td>{formatLedgerDate(entry.transactionDate)}</td>
                  <td className="mono">{entry.journalDisplayId}</td>
                  <td>{entry.merchant}</td>
                  <td>{entry.selectedRule ?? '—'}</td>
                  <td className="num">{formatMoneyCell(entry.totalDebits)}</td>
                  <td className="num">{formatMoneyCell(entry.totalCredits)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JournalDetail(props: {
  entry: EngineLedgerEntryView;
  accountName?: string;
  accounts: EngineAccountBalanceView[];
  onBack: () => void;
  onHome: () => void;
  onOpenAccount: (accountId: string) => void;
  onViewInEngine: () => void;
  onViewTransaction: () => void;
  onViewTransformation: () => void;
}): JSX.Element {
  const entry = props.entry;
  return (
    <div className="activity-pane">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onHome}>Ledger</button>
        <span>/</span>
        {props.accountName !== undefined ? (
          <>
            <button type="button" onClick={props.onBack}>{props.accountName}</button>
            <span>/</span>
          </>
        ) : (
          <>
            <button type="button" onClick={props.onBack}>Journals</button>
            <span>/</span>
          </>
        )}
        <span>{entry.journalDisplayId ?? 'Journal'}</span>
      </nav>
      <div className="account-hero">
        <div>
          <h2>{entry.journalDisplayId ?? 'Journal'}</h2>
          <div className="sub">{entry.merchant} · {formatLedgerDate(entry.transactionDate)}</div>
          {entry.transactionDisplayId !== null ? (
            <button className="lineage-link" type="button" onClick={props.onViewTransaction}>
              Source {entry.transactionDisplayId}
            </button>
          ) : null}
        </div>
        <div className="account-balance">
          <small>{entry.selectedRule ?? 'Posted journal'}</small>
          <b>{rupee(entry.amount)}</b>
        </div>
      </div>
      <div className="section journal-lines">
        {entry.lines.map((line) => {
          const account = props.accounts.find((row) => row.code === line.accountCode);
          return (
            <button
              className="row journal-account-row"
              type="button"
              key={`${entry.eventId}-${line.accountCode}-${line.debit}-${line.credit}`}
              onClick={() => {
                if (account !== undefined) {
                  props.onOpenAccount(account.accountId);
                }
              }}
            >
              <span>{line.debit > 0 ? 'DR' : 'CR'} {line.accountName} ({line.accountCode})</span>
              <b>{rupee(line.debit > 0 ? line.debit : line.credit)}</b>
            </button>
          );
        })}
      </div>
      <div className={`balance-ok${entry.balanced ? '' : ' warn'}`}>
        <span>{entry.balanced ? 'Balanced' : 'Needs review'}</span>
        <span>{rupee(entry.totalDebits)} = {rupee(entry.totalCredits)}</span>
      </div>
      <div className="lineage-actions">
        {entry.transactionDisplayId !== null ? (
          <button className="btn tiny" type="button" onClick={props.onViewTransaction}>View Transaction</button>
        ) : null}
        <button className="btn tiny" type="button" onClick={props.onViewTransformation}>View Transformation</button>
        <button className="btn tiny" type="button" onClick={props.onViewInEngine}>View in Engine</button>
      </div>
    </div>
  );
}

function TrialBalanceView(props: {
  trial: EngineSnapshot['trialBalance'];
  onOpenAccount: (accountId: string) => void;
}): JSX.Element {
  const trial = props.trial;
  return (
    <div className="ledger-body">
      <div className="trial-head">
        <div>
          <div className="trial-kicker">Trial balance</div>
          <div className="sub">{formatAsOf(trial.asOf)}</div>
        </div>
      </div>
      <div className="table-wrap ledger-table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            {trial.lines.map((line) => (
              <tr
                key={line.accountId}
                tabIndex={0}
                role="button"
                onClick={() => props.onOpenAccount(line.accountId)}
                onKeyDown={activateRow(() => props.onOpenAccount(line.accountId))}
              >
                <td>
                  <b>{line.name}</b>
                  <div className="meta">{line.code} · {accountTypeLabel(line.type)}</div>
                </td>
                <td className="num">{formatMoneyCell(line.debit)}</td>
                <td className="num">{formatMoneyCell(line.credit)}</td>
              </tr>
            ))}
            {trial.lines.length === 0 ? (
              <tr>
                <td colSpan={3}><p className="sub">No balances to report yet. Run a transaction through the engine.</p></td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <th>Total{trial.balanced ? ' · Debits = Credits' : ''}</th>
              <th className="num">{rupee(trial.totalDebits)}</th>
              <th className="num">{rupee(trial.totalCredits)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function accountClassLabel(type: EngineAccountType): string {
  if (type === 'ASSET') return 'Assets';
  if (type === 'LIABILITY') return 'Liabilities';
  if (type === 'EQUITY') return 'Equity';
  if (type === 'INCOME') return 'Income';
  return 'Expenses';
}

function activateRow(action: () => void): (event: KeyboardEvent<HTMLTableRowElement>) => void {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}
