'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  EngineEventType,
  EngineRuleView,
  EngineSnapshot,
  EngineSimulationView,
  EngineTransactionView,
  StudioPane,
  accountTypeLabel,
  activityLabel,
  activitySingular,
  formatAsOf,
  rupee
} from './engine-types';
import {
  ASK_EXAMPLES,
  ATTRIBUTE_SOURCES,
  AccountingProposal,
  CANONICAL_SOURCES,
  FUTURE_SOURCES,
  STUDIO_ACTIVITIES,
  StudioRecentWork,
  StudioSearchHit,
  accountsUsing,
  classifyStudioIntent,
  dslForRule,
  findTransformation,
  groupIndexTransformations,
  humanCondition,
  isFallbackTransformation,
  matchSummary,
  matchesTransformation,
  overlapStatus,
  parseTeachInstruction,
  proposalReady,
  proposeAccounting,
  rulesForActivity,
  searchStudioModel,
  sourcesForActivity,
  suggestAccountCode,
  transformationHeadline,
  treatmentLabel,
  unscopedRules,
  usageFor
} from './studio-model';

const RAIL: Array<{ group: string | null; id: StudioPane; label: string }> = [
  { group: null, id: 'overview', label: 'Home' },
  { group: 'Accounting', id: 'transformations', label: 'Transformations' },
  { group: 'Accounting', id: 'accounts', label: 'Accounts' },
  { group: 'Model', id: 'activities', label: 'Activities' },
  { group: 'Model', id: 'sources', label: 'Sources' },
  { group: 'Governance', id: 'versions', label: 'Versions' }
];

export function StudioPanel(props: {
  snapshot: EngineSnapshot;
  pane: StudioPane;
  activity: EngineEventType | null;
  transformationId: string | null;
  contextEventId: string | null;
  recents: StudioRecentWork[];
  busy: boolean;
  onPane: (pane: StudioPane) => void;
  onSelectActivity: (type: EngineEventType | null) => void;
  onOpenTransformation: (id: string, eventId?: string | null) => void;
  onCloseTransformation: () => void;
  onCreateProposal: (proposal: AccountingProposal) => void;
  onAddAccount: (input: { name: string; code: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; parentCode?: string; currency?: string }) => void;
  onUpdateAccount: (input: { code: string; name?: string; type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' }) => void;
  onSimulate: (ruleId: string, eventId?: string) => void;
  onViewInEngine: (ruleId: string, eventId: string | null) => void;
  onViewTransactions: (ruleId: string) => void;
  onOpenAccount: (accountCode: string) => void;
  onAddCondition: (ruleId: string, field: string, op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN', value: string | number) => void;
  onAddLine: (ruleId: string, side: 'DEBIT' | 'CREDIT', accountCode: string) => void;
  onToggle: (ruleId: string) => void;
}): JSX.Element {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [proposal, setProposal] = useState<AccountingProposal | null>(null);
  const [proposalEditing, setProposalEditing] = useState(false);
  const [askHint, setAskHint] = useState<string | null>(null);
  const transformation = findTransformation(props.snapshot, props.transformationId);
  const contextTx = props.snapshot.transactions.find((row) => row.eventId === props.contextEventId);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && (key === 'k' || event.code === 'KeyK')) {
        event.preventDefault();
        if (commandOpen) {
          setCommandOpen(false);
          return;
        }
        setCommandQuery('');
        setCommandOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandOpen]);

  function goPane(pane: StudioPane, activity?: EngineEventType): void {
    if (activity !== undefined) {
      props.onSelectActivity(activity);
    }
    if (pane !== 'transformations') {
      props.onCloseTransformation();
    }
    props.onPane(pane);
  }

  useEffect(() => {
    if (proposal === null) {
      return;
    }
    setProposal((current) => {
      if (current === null) {
        return current;
      }
      return {
        ...current,
        lines: current.lines.map((line) => {
          const found = props.snapshot.accounts.find((account) =>
            account.name.toLowerCase() === line.accountName.toLowerCase()
            || (line.accountCode !== null && account.code === line.accountCode)
          );
          if (found === undefined) {
            return line;
          }
          return {
            ...line,
            exists: true,
            accountCode: found.code,
            accountName: found.name
          };
        })
      };
    });
  }, [props.snapshot.accounts]);

  function askSutra(text: string): void {
    const intent = classifyStudioIntent(text, props.snapshot);
    if (intent.kind === 'teach') {
      const next = proposeAccounting(text, props.snapshot.accounts);
      if ('error' in next) {
        setAskHint(next.error);
        return;
      }
      setAskHint(null);
      setProposal(next);
      setProposalEditing(false);
      goPane('overview');
      return;
    }
    if (intent.kind === 'explain') {
      if (intent.transformationId !== null) {
        props.onOpenTransformation(intent.transformationId, intent.eventId);
        return;
      }
      setCommandQuery(text);
      setCommandOpen(true);
      return;
    }
    if (intent.kind === 'navigate') {
      goPane(intent.pane, intent.activity);
      return;
    }
    setCommandQuery(intent.query);
    setCommandOpen(true);
  }

  function runHit(hit: StudioSearchHit): void {
    setCommandOpen(false);
    if (hit.kind === 'ask' && hit.ask !== undefined) {
      askSutra(hit.ask);
      return;
    }
    if (hit.transformationId !== undefined) {
      props.onOpenTransformation(hit.transformationId);
      return;
    }
    if (hit.accountCode !== undefined) {
      props.onOpenAccount(hit.accountCode);
      return;
    }
    goPane(hit.pane, hit.activity);
  }

  return (
    <section className="panel page-panel studio-page">
      <div className="studio-shell">
        <nav className="studio-rail" aria-label="Accounting Studio">
          <div className="studio-rail-kicker">Studio</div>
          {RAIL.map((item, index) => {
            const prev = RAIL[index - 1];
            const showGroup = item.group !== null && item.group !== prev?.group;
            return (
              <div key={item.id}>
                {showGroup ? <div className="studio-rail-group">{item.group}</div> : null}
                <button
                  type="button"
                  className={props.pane === item.id ? 'active' : ''}
                  onClick={() => goPane(item.id)}
                >
                  {item.label}
                </button>
              </div>
            );
          })}
          <button className="studio-rail-search" type="button" onClick={() => { setCommandQuery(''); setCommandOpen(true); }}>
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
        </nav>
        <div className="studio-main">
          {transformation !== undefined && props.pane === 'transformations' ? (
            <TransformationWorkspace
              snapshot={props.snapshot}
              rule={transformation}
              context={contextTx}
              simulation={
                props.snapshot.lastSimulation?.intendedRuleDisplayId === transformation.displayId
                  ? props.snapshot.lastSimulation
                  : null
              }
              busy={props.busy}
              onBack={props.onCloseTransformation}
              onTeach={askSutra}
              onSimulate={props.onSimulate}
              onViewInEngine={props.onViewInEngine}
              onViewTransactions={props.onViewTransactions}
              onOpenAccount={props.onOpenAccount}
              onAddCondition={props.onAddCondition}
              onAddLine={props.onAddLine}
              onToggle={props.onToggle}
            />
          ) : props.pane === 'overview' ? (
            <StudioOverview
              snapshot={props.snapshot}
              proposal={proposal}
              editing={proposalEditing}
              hint={askHint}
              busy={props.busy}
              onAsk={askSutra}
              onProposal={setProposal}
              onEdit={() => setProposalEditing(true)}
              onCancel={() => { setProposal(null); setProposalEditing(false); }}
              onCreate={() => {
                if (proposal === null || !proposalReady(proposal)) {
                  return;
                }
                props.onCreateProposal(proposal);
                setProposal(null);
                setProposalEditing(false);
              }}
              onAddAccount={props.onAddAccount}
              onOpenTransformation={(id) => props.onOpenTransformation(id)}
            />
          ) : props.pane === 'activities' ? (
            <ActivitiesPane
              snapshot={props.snapshot}
              selected={props.activity}
              onSelect={props.onSelectActivity}
              onOpenTransformation={(id) => props.onOpenTransformation(id)}
              onOpenSources={() => goPane('sources')}
              onTeach={askSutra}
            />
          ) : props.pane === 'sources' ? (
            <SourcesPane
              snapshot={props.snapshot}
              selected={props.activity}
              onSelect={props.onSelectActivity}
            />
          ) : props.pane === 'transformations' ? (
            <TransformationsIndex
              snapshot={props.snapshot}
              onOpen={(id) => props.onOpenTransformation(id)}
              onTeach={askSutra}
            />
          ) : props.pane === 'accounts' ? (
            <StudioAccounts
              snapshot={props.snapshot}
              onOpenTransformation={(id) => props.onOpenTransformation(id)}
              onOpenAccount={props.onOpenAccount}
              onAddAccount={props.onAddAccount}
              onUpdateAccount={props.onUpdateAccount}
            />
          ) : (
            <StudioVersions snapshot={props.snapshot} />
          )}
        </div>
      </div>
      {commandOpen ? (
        <CommandPalette
          snapshot={props.snapshot}
          query={commandQuery}
          onQuery={setCommandQuery}
          onClose={() => setCommandOpen(false)}
          onPick={runHit}
          onAsk={askSutra}
        />
      ) : null}
    </section>
  );
}

function StudioOverview(props: {
  snapshot: EngineSnapshot;
  proposal: AccountingProposal | null;
  editing: boolean;
  hint: string | null;
  busy: boolean;
  onAsk: (instruction: string) => void;
  onProposal: (proposal: AccountingProposal) => void;
  onEdit: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onAddAccount: (input: { name: string; code: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' }) => void;
  onOpenTransformation: (id: string) => void;
}): JSX.Element {
  if (props.proposal !== null) {
    return (
      <UnderstandBoard
        snapshot={props.snapshot}
        proposal={props.proposal}
        editing={props.editing}
        busy={props.busy}
        onProposal={props.onProposal}
        onEdit={props.onEdit}
        onCancel={props.onCancel}
        onCreate={props.onCreate}
        onAddAccount={props.onAddAccount}
      />
    );
  }
  const recent = props.snapshot.rules.slice().sort((left, right) => right.priority - left.priority).slice(0, 6);
  return (
    <div className="studio-home studio-tell">
      <div className="studio-kicker">Accounting Studio</div>
      <h1>Tell Kanakku what you want.</h1>
      <p className="sub">Describe how you want your transactions accounted. Kanakku will turn your intent into accounting logic.</p>
      <TellForm hint={props.hint} onAsk={props.onAsk} />
      <div className="studio-ask-examples studio-tell-examples">
        <span>Try</span>
        {ASK_EXAMPLES.map((example) => (
          <button key={example.chip} type="button" onClick={() => props.onAsk(example.prompt)}>
            {example.prompt}
          </button>
        ))}
      </div>
      {recent.length > 0 ? (
        <section className="studio-recent-accounting" aria-label="Recent accounting">
          <div className="studio-kicker">Recent accounting</div>
          <ul>
            {recent.map((rule) => (
              <li key={rule.displayId}>
                <button type="button" onClick={() => props.onOpenTransformation(rule.displayId)}>
                  <b>{rule.name}</b>
                  <span>{rule.enabled ? 'Active' : 'Off'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function TellForm(props: {
  hint: string | null;
  onAsk: (instruction: string) => void;
}): JSX.Element {
  const [text, setText] = useState('');
  return (
    <form
      className="studio-tell-well"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (text.trim().length === 0) {
          return;
        }
        props.onAsk(text);
      }}
    >
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="Mark all Starbucks expenses > ₹5,000 as Business Meals"
        aria-label="Tell Kanakku what you want"
      />
      <button className="btn" type="submit">Teach →</button>
      {props.hint !== null ? <p className="sub">{props.hint}</p> : null}
    </form>
  );
}

function UnderstandBoard(props: {
  snapshot: EngineSnapshot;
  proposal: AccountingProposal;
  editing: boolean;
  busy: boolean;
  onProposal: (proposal: AccountingProposal) => void;
  onEdit: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onAddAccount: (input: { name: string; code: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' }) => void;
}): JSX.Element {
  const proposal = props.proposal;
  const missing = proposal.lines.filter((line) => !line.exists);
  const ready = proposalReady(proposal);

  function updateCondition(index: number, patch: Partial<AccountingProposal['conditions'][number]>): void {
    props.onProposal({
      ...proposal,
      conditions: proposal.conditions.map((condition, current) => current === index ? { ...condition, ...patch } : condition)
    });
  }

  function updateLine(index: number, accountCode: string): void {
    const account = props.snapshot.accounts.find((row) => row.code === accountCode);
    if (account === undefined) {
      return;
    }
    props.onProposal({
      ...proposal,
      lines: proposal.lines.map((line, current) => current === index
        ? { ...line, accountCode: account.code, accountName: account.name, exists: true }
        : line)
    });
  }

  return (
    <div className="studio-home studio-understand">
      <div className="studio-kicker">I understand</div>
      <h1>{proposal.transactional !== undefined ? 'Kanakku will track this operationally and account for it' : 'You want Kanakku to account for this'}</h1>
      <p className="sub">{proposal.instruction}</p>

      {props.editing ? (
        <div className="studio-understand-edit">
          <section>
            <div className="studio-kicker">When</div>
            {proposal.conditions.map((condition, index) => (
              <div className="studio-add" key={`${condition.field}-${index}`}>
                <select value={condition.field} onChange={(event) => updateCondition(index, { field: event.target.value })}>
                  <option value="eventType">Activity</option>
                  <option value="counterparty">Counterparty</option>
                  <option value="amount">Amount</option>
                </select>
                <select value={condition.op} onChange={(event) => updateCondition(index, { op: event.target.value as typeof condition.op })}>
                  <option value="=">equals</option>
                  <option value=">">greater than</option>
                  <option value=">=">at least</option>
                  <option value="<">less than</option>
                  <option value="<=">at most</option>
                </select>
                {condition.field === 'eventType' ? (
                  <select value={String(condition.value)} onChange={(event) => updateCondition(index, { value: event.target.value })}>
                    <option value="PURCHASE">Purchase</option>
                    <option value="PAYMENT">Payment</option>
                    <option value="REFUND">Refund</option>
                    <option value="USAGE">Usage</option>
                    <option value="WALLET_LOAD">Wallet load</option>
                    <option value="WALLET_SPEND">Wallet purchase</option>
                    <option value="MARKETPLACE_SALE">Marketplace sale</option>
                    <option value="SELLER_PAYOUT">Payout</option>
                  </select>
                ) : (
                  <input
                    value={String(condition.value)}
                    onChange={(event) => updateCondition(index, {
                      value: condition.field === 'amount' ? Number(event.target.value) || 0 : event.target.value
                    })}
                  />
                )}
                <button className="lineage-link" type="button" onClick={() => props.onProposal({
                  ...proposal,
                  conditions: proposal.conditions.filter((_, current) => current !== index)
                })}>×</button>
              </div>
            ))}
            <button className="lineage-link" type="button" onClick={() => props.onProposal({
              ...proposal,
              conditions: [...proposal.conditions, { field: 'counterparty', op: '=', value: '' }]
            })}>+ Add condition</button>
          </section>
          <section>
            <div className="studio-kicker">Then</div>
            {proposal.lines.map((line, index) => (
              <div className="studio-add" key={`${line.side}-${index}`}>
                <select
                  value={line.side}
                  onChange={(event) => props.onProposal({
                    ...proposal,
                    lines: proposal.lines.map((row, current) => current === index ? { ...row, side: event.target.value as 'DEBIT' | 'CREDIT' } : row)
                  })}
                >
                  <option value="DEBIT">Debit</option>
                  <option value="CREDIT">Credit</option>
                </select>
                <select value={line.accountCode ?? ''} onChange={(event) => updateLine(index, event.target.value)}>
                  {line.accountCode === null ? <option value="">Choose existing account</option> : null}
                  {props.snapshot.accounts.map((account) => (
                    <option key={account.code} value={account.code}>{account.code} {account.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </section>
          <p className="sub">Amount · Transaction amount</p>
        </div>
      ) : (
        <div className="studio-understand-card">
          <section>
            <div className="studio-kicker">When</div>
            <dl>
              {proposal.conditions.map((condition) => (
                <div key={`${condition.field}-${condition.value}`}>
                  <dt>{condition.field === 'eventType' ? 'Activity' : condition.field === 'counterparty' ? 'Counterparty' : 'Amount'}</dt>
                  <dd>
                    {condition.field === 'eventType'
                      ? activitySingular(String(condition.value) as EngineEventType)
                      : condition.field === 'amount'
                        ? `${condition.op} ${rupee(Number(condition.value))}`
                        : String(condition.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          {proposal.transactional !== undefined ? (
            <section>
              <div className="studio-kicker">Transactional</div>
              <dl>
                <div>
                  <dt>{proposal.transactional.participantKind === 'SELLER' ? 'Seller balance' : 'Buyer wallet'}</dt>
                  <dd>
                    {proposal.transactional.effects.map((effect) => (
                      <div key={`${effect.type}-${effect.description}`}>
                        {effect.direction === 'CREDIT' ? '+' : '−'} {effect.description}
                        {effect.amount.type === 'RATE' ? ` · ${Math.round(effect.amount.rate * 1000) / 10}%` : ''}
                      </div>
                    ))}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
          <section>
            <div className="studio-kicker">Accounting</div>
            <dl>
              {proposal.lines.map((line) => (
                <div key={`${line.side}-${line.accountName}-${line.description ?? ''}`}>
                  <dt>{line.side === 'DEBIT' ? 'Debit' : 'Credit'}</dt>
                  <dd>{line.accountName}{line.accountCode !== null ? ` · ${line.accountCode}` : ''}{line.rate !== undefined ? ` · ${Math.round(line.rate * 1000) / 10}%` : ''}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <div className="studio-kicker">Amount</div>
            <p>Transaction amount</p>
          </section>
        </div>
      )}

      {missing.map((line) => (
        <div className="studio-missing-account" key={line.accountName}>
          <p><b>{line.accountName}</b> doesn't exist in your chart of accounts.</p>
          <div className="studio-understand-actions">
            <button className="btn tiny" type="button" onClick={() => props.onAddAccount({
              name: line.accountName,
              code: suggestAccountCode(line.suggestedType, props.snapshot.accounts.map((account) => account.code)),
              type: line.suggestedType
            })}>
              Create {line.accountName} · {accountTypeLabel(line.suggestedType)}
            </button>
            <select defaultValue="" onChange={(event) => {
              const index = proposal.lines.findIndex((row) => row.side === line.side && row.accountName === line.accountName);
              if (index >= 0 && event.target.value.length > 0) {
                updateLine(index, event.target.value);
              }
            }}>
              <option value="">Choose existing account</option>
              {props.snapshot.accounts.map((account) => (
                <option key={account.code} value={account.code}>{account.code} {account.name}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <div className="studio-understand-actions">
        <button className="btn tiny ghost" type="button" onClick={props.onCancel}>Ask again</button>
        <button className="btn tiny ghost" type="button" onClick={props.onEdit}>{props.editing ? 'Done' : 'Edit'}</button>
        <button className="btn tiny" type="button" onClick={props.onCreate} disabled={!ready || props.busy}>
          Create transformation
        </button>
      </div>
    </div>
  );
}

function ActivitiesPane(props: {
  snapshot: EngineSnapshot;
  selected: EngineEventType | null;
  onSelect: (type: EngineEventType | null) => void;
  onOpenTransformation: (id: string) => void;
  onOpenSources: () => void;
  onTeach: (instruction: string) => void;
}): JSX.Element {
  const selected = props.selected ?? 'PURCHASE';
  const [query, setQuery] = useState('');
  const all = rulesForActivity(props.snapshot.rules, selected);
  const rules = all
    .filter((rule) => matchesTransformation(rule, query))
    .slice()
    .sort((a, b) => b.priority - a.priority);
  const leftover = unscopedRules(props.snapshot.rules);
  const sources = sourcesForActivity(selected);
  return (
    <div className="studio-home">
      <header className="studio-hero compact">
        <div>
          <div className="studio-kicker">Business model · Activities</div>
          <h1>{activityLabel(selected)} accounting</h1>
          <p className="sub">{all.length} transformation{all.length === 1 ? '' : 's'} decide how a {activitySingular(selected).toLowerCase()} becomes a journal.</p>
        </div>
        <AskSutra snapshot={props.snapshot} onAsk={props.onTeach} variant="compact" />
      </header>
      <div className="studio-activity-tabs" role="tablist" aria-label="Business activities">
        {STUDIO_ACTIVITIES.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={selected === type}
            className={selected === type ? 'active' : ''}
            onClick={() => props.onSelect(type)}
          >
            {activityLabel(type)}
            <span>{rulesForActivity(props.snapshot.rules, type).length}</span>
          </button>
        ))}
      </div>
      <div className="studio-index-tools">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${activityLabel(selected).toLowerCase()}…`}
          aria-label={`Search ${activityLabel(selected)} transformations`}
        />
      </div>
      <div className="studio-activity-split">
        <section className="studio-block">
          <div className="studio-kicker">Available information</div>
          <ul className="studio-source-list">
            {sources.canonical.map((field) => (
              <li key={field.id}><b>{field.label}</b><span>{field.note}</span></li>
            ))}
            {sources.attributes.map((field) => (
              <li key={field.id}><b>{field.label}</b><span>Attribute · {field.note}</span></li>
            ))}
          </ul>
          <button className="lineage-link" type="button" onClick={props.onOpenSources}>View all sources</button>
        </section>
        <section>
          <div className="studio-kicker">Transformations · priority wins</div>
          <TransformationTable rules={rules} onOpen={props.onOpenTransformation} />
          {leftover.length > 0 ? (
            <p className="sub">Unscoped transformations appear under Transformations.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SourcesPane(props: {
  snapshot: EngineSnapshot;
  selected: EngineEventType | null;
  onSelect: (type: EngineEventType | null) => void;
}): JSX.Element {
  const selected = props.selected ?? 'PURCHASE';
  const sources = sourcesForActivity(selected);
  return (
    <div className="studio-home">
      <header className="studio-hero compact">
        <div>
          <div className="studio-kicker">Business model · Sources</div>
          <h1>Raw materials for accounting decisions</h1>
          <p className="sub">These are the fields transformations can match and the amounts they can take. Origin is how the event arrived, not a mapping set. {props.snapshot.rules.length} transformations in the live model can read them.</p>
        </div>
      </header>
      <div className="studio-activity-tabs" role="tablist" aria-label="Sources by activity">
        {STUDIO_ACTIVITIES.map((type) => (
          <button
            key={type}
            type="button"
            className={selected === type ? 'active' : ''}
            onClick={() => props.onSelect(type)}
          >
            {activityLabel(type)}
          </button>
        ))}
      </div>
      <section className="studio-block">
        <div className="studio-kicker">Canonical · the engine can resolve these</div>
        <SourceTable fields={CANONICAL_SOURCES} />
      </section>
      <section className="studio-block">
        <div className="studio-kicker">Attributes in use · {activityLabel(selected)}</div>
        <SourceTable fields={sources.attributes.length > 0 ? sources.attributes : ATTRIBUTE_SOURCES} />
      </section>
      <section className="studio-block">
        <div className="studio-kicker">Not first-class yet</div>
        <SourceTable fields={FUTURE_SOURCES} />
        <p className="sub">The kernel can already condition on <code>attributes.&lt;name&gt;</code>. These are not dedicated source objects, mapping sets, or dimensions.</p>
      </section>
    </div>
  );
}

function SourceTable(props: { fields: Array<{ id: string; label: string; kind: string; note: string }> }): JSX.Element {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Kind</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {props.fields.map((field) => (
            <tr key={field.id}>
              <td>{field.label}</td>
              <td>{field.kind === 'canonical' ? 'Event field' : field.kind === 'attribute' ? 'Attribute' : 'Future'}</td>
              <td>{field.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransformationsIndex(props: {
  snapshot: EngineSnapshot;
  onOpen: (id: string) => void;
  onTeach: (instruction: string) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const rules = props.snapshot.rules.filter((rule) => matchesTransformation(rule, query));
  const groups = groupIndexTransformations(rules);
  return (
    <div className="studio-home tx-simple">
      <header className="studio-hero compact">
        <div>
          <div className="studio-kicker">Accounting · Transformations</div>
          <h1>The instructions Kanakku uses to turn transactions into accounting</h1>
        </div>
        <AskSutra
          snapshot={props.snapshot}
          onAsk={props.onTeach}
          variant="compact"
          placeholder="Mark all Starbucks expenses > ₹5,000 as Business Meals"
        />
      </header>
      <div className="studio-index-tools">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search transformations…"
          aria-label="Search transformations"
        />
      </div>
      {groups.length === 0 ? (
        <p className="sub">No transformations match. Teach Kanakku to add one.</p>
      ) : groups.map((group) => (
        <section key={group.key} className="tx-simple-group">
          <div className="studio-kicker">{group.label}</div>
          <ul className="tx-simple-list">
            {group.rules.map((rule) => {
              const fallback = isFallbackTransformation(rule, props.snapshot.rules);
              return (
                <li key={rule.displayId}>
                  <button type="button" onClick={() => props.onOpen(rule.displayId)}>
                    <b>{rule.displayId} {rule.name}</b>
                    <span>{fallback ? 'Default' : matchSummary(rule)}</span>
                    <span>{treatmentLabel(rule)}</span>
                    <small>{rule.enabled ? 'Active' : 'Off'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StudioAccounts(props: {
  snapshot: EngineSnapshot;
  onOpenTransformation: (id: string) => void;
  onOpenAccount: (accountCode: string) => void;
  onAddAccount: (input: { name: string; code: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'; parentCode?: string; currency?: string }) => void;
  onUpdateAccount: (input: { code: string; name?: string; type?: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' }) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE'>('EXPENSE');
  const [parentCode, setParentCode] = useState('');
  const needle = query.trim().toLowerCase();
  const rows = props.snapshot.accountBalances.filter((account) => {
    if (needle.length === 0) {
      return true;
    }
    return `${account.code} ${account.name} ${account.type}`.toLowerCase().includes(needle);
  });
  const selectedAccount = props.snapshot.accountBalances.find((account) => account.code === selected);
  const used = selectedAccount === undefined ? [] : accountsUsing(props.snapshot, selectedAccount.code);

  return (
    <div className="studio-home studio-coa">
      <header className="studio-hero compact">
        <div>
          <div className="studio-kicker">Accounting · Accounts</div>
          <h1>Where should accounting land?</h1>
        </div>
        <button className="btn tiny" type="button" onClick={() => setCreating((value) => !value)}>
          {creating ? 'Close' : '+ Add account'}
        </button>
      </header>
      {creating ? (
        <form
          className="studio-coa-create"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (name.trim().length === 0 || code.trim().length === 0) {
              return;
            }
            props.onAddAccount({
              name: name.trim(),
              code: code.trim(),
              type,
              ...(parentCode.length > 0 ? { parentCode } : {}),
              currency: 'INR'
            });
            setName('');
            setCode('');
            setParentCode('');
            setCreating(false);
            setSelected(code.trim());
          }}
        >
          <div className="studio-kicker">Create account</div>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Business Meals" /></label>
          <label>Code<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="5220" /></label>
          <label>Type
            <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
              <option value="EXPENSE">Expense</option>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="INCOME">Income</option>
              <option value="EQUITY">Equity</option>
            </select>
          </label>
          <label>Parent account (optional)
            <select value={parentCode} onChange={(event) => setParentCode(event.target.value)}>
              <option value="">None</option>
              {props.snapshot.accountBalances.map((account) => (
                <option key={account.code} value={account.code}>{account.code} {account.name}</option>
              ))}
            </select>
          </label>
          <button className="btn tiny" type="submit">Create account</button>
        </form>
      ) : null}
      <div className="studio-index-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounts…" aria-label="Search accounts" />
      </div>
      {selectedAccount !== undefined ? (
        <section className="studio-coa-detail">
          <div>
            <div className="studio-kicker">{selectedAccount.code} · {accountTypeLabel(selectedAccount.type)}</div>
            <h2>{selectedAccount.name}</h2>
            <p className="sub">Current balance {rupee(selectedAccount.balance)} {selectedAccount.balanceSide === 'DEBIT' ? 'DR' : 'CR'}</p>
            <AccountRename
              key={selectedAccount.code}
              code={selectedAccount.code}
              name={selectedAccount.name}
              onSave={(next) => props.onUpdateAccount({ code: selectedAccount.code, name: next })}
            />
          </div>
          <div>
            <div className="studio-kicker">Used by</div>
            {used.length === 0 ? <p className="sub">No transformations yet.</p> : used.map((rule) => (
              <button key={rule.displayId} className="lineage-link" type="button" onClick={() => props.onOpenTransformation(rule.displayId)}>
                {rule.displayId} {rule.name}
              </button>
            ))}
          </div>
          <div className="studio-understand-actions">
            <button className="btn tiny ghost" type="button" onClick={() => props.onOpenAccount(selectedAccount.code)}>View in Ledger</button>
            <button className="btn tiny ghost" type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
        </section>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Type</th>
              <th>Used by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => {
              const using = accountsUsing(props.snapshot, account.code);
              const fallback = using.some((rule) => isFallbackTransformation(rule, props.snapshot.rules));
              return (
                <tr key={account.accountId} className="studio-row" onClick={() => setSelected(account.code)}>
                  <td>{account.code}</td>
                  <td>{account.name}</td>
                  <td>{accountTypeLabel(account.type)}</td>
                  <td>{fallback && using.length === 0 ? 'Default' : using.length === 0 ? '—' : `${using.length} transformation${using.length === 1 ? '' : 's'}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountRename(props: { code: string; name: string; onSave: (name: string) => void }): JSX.Element {
  const [name, setName] = useState(props.name);
  return (
    <form
      className="studio-add"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (name.trim().length > 0) {
          props.onSave(name.trim());
        }
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Account name" />
      <button className="btn tiny" type="submit">Save name</button>
    </form>
  );
}

function StudioVersions(props: { snapshot: EngineSnapshot }): JSX.Element {
  const policy = props.snapshot.policy;
  return (
    <div className="studio-home">
      <header className="studio-hero compact">
        <div>
          <div className="studio-kicker">Governance · Versions</div>
          <h1>Live accounting policy</h1>
          <p className="sub">Versions apply to the whole policy, not a single transformation.</p>
        </div>
      </header>
      {policy === null ? (
        <p className="sub">No active policy is compiled.</p>
      ) : (
        <div className="studio-version">
          <div>
            <small>Live policy</small>
            <b>{policy.name}</b>
            <span>Version {policy.version} · Active</span>
            <span>Effective {formatAsOf(policy.effectiveFrom).replace('As of ', '')}</span>
            <span>{policy.transformationCount} active transformations</span>
          </div>
          <p className="sub">Enabling or disabling a transformation rebuilds this live policy. Prior versions are not retained in this session. Lifecycle (draft → validated → simulated → approved → active → retired) is enforced by the kernel.</p>
        </div>
      )}
    </div>
  );
}

function TransformationTable(props: {
  rules: EngineRuleView[];
  onOpen: (id: string) => void;
}): JSX.Element {
  if (props.rules.length === 0) {
    return <p className="sub">No transformations match. Teach Kanakku to add one, or clear search.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Transformation</th>
            <th>Activity</th>
            <th>Treatment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {props.rules.map((rule) => (
            <tr key={rule.displayId} className="studio-row" onClick={() => props.onOpen(rule.displayId)}>
              <td>{rule.priority}</td>
              <td><span className="studio-id">{rule.displayId}</span> {rule.name}</td>
              <td>{rule.activity === null ? 'Unscoped' : activityLabel(rule.activity)}</td>
              <td>
                {rule.lines.map((line) => (
                  <div key={`${line.side}-${line.accountCode}`}>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName}</div>
                ))}
              </td>
              <td>{rule.enabled ? 'Active' : 'Off'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransformationWorkspace(props: {
  snapshot: EngineSnapshot;
  rule: EngineRuleView;
  context: EngineTransactionView | undefined;
  simulation: EngineSimulationView | null;
  busy: boolean;
  onBack: () => void;
  onTeach: (instruction: string) => void;
  onSimulate: (ruleId: string, eventId?: string) => void;
  onViewInEngine: (ruleId: string, eventId: string | null) => void;
  onViewTransactions: (ruleId: string) => void;
  onOpenAccount: (accountCode: string) => void;
  onAddCondition: (ruleId: string, field: string, op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN', value: string | number) => void;
  onAddLine: (ruleId: string, side: 'DEBIT' | 'CREDIT', accountCode: string) => void;
  onToggle: (ruleId: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [showDsl, setShowDsl] = useState(false);
  const [teachOpen, setTeachOpen] = useState(false);
  const rule = props.rule;
  const usage = usageFor(props.snapshot, rule);
  const replayId = props.context?.eventId ?? usage.transactions[0]?.eventId ?? null;
  const policy = props.snapshot.policy;
  const journal = props.context === undefined
    ? undefined
    : props.snapshot.ledger.find((entry) => entry.eventId === props.context?.eventId);
  const overlap = overlapStatus(rule, props.snapshot.rules);
  return (
    <div className="tx-workspace studio-work">
      <nav className="crumb" aria-label="Breadcrumb">
        <button type="button" onClick={props.onBack}>Transformations</button>
        <span>/</span>
        {rule.activity !== null ? <span>{activityLabel(rule.activity)}</span> : null}
        {rule.activity !== null ? <span>/</span> : null}
        <span>{rule.name}</span>
      </nav>
      <header className="studio-work-hero">
        <div>
          <div className="studio-kicker">{rule.displayId} · {rule.activity === null ? 'Unscoped' : activitySingular(rule.activity)}</div>
          <h2>{rule.name}</h2>
          <p className="sub">{transformationHeadline(rule)}</p>
        </div>
        <div className="studio-work-actions">
          <span className="studio-priority">Priority {rule.priority}</span>
          <span className={`tx-pill ${rule.enabled ? 'ok' : 'warn'}`}>{rule.enabled ? 'Active' : 'Off'}</span>
          <button className="btn tiny" type="button" onClick={() => setEditing((value) => !value)}>{editing ? 'Done' : 'Edit'}</button>
          <button className="btn tiny" type="button" onClick={() => props.onSimulate(rule.displayId, props.context?.eventId)} disabled={props.busy}>Simulate</button>
          <button className="btn tiny ghost" type="button" onClick={() => props.onViewInEngine(rule.displayId, replayId)}>View in Engine</button>
          <button className="btn tiny ghost" type="button" onClick={() => props.onViewTransactions(rule.displayId)}>Transactions</button>
        </div>
      </header>
      {props.context !== undefined ? (
        <div className="studio-context">
          Explaining {props.context.displayId} · {props.context.counterparty} · {rupee(props.context.amount)}
        </div>
      ) : null}

      {editing ? (
        <EditWorkbench
          snapshot={props.snapshot}
          rule={rule}
          onAddCondition={props.onAddCondition}
          onAddLine={props.onAddLine}
          onToggle={props.onToggle}
          onOpenAccount={props.onOpenAccount}
        />
      ) : (
        <div className="studio-overview-grid">
          <AccountingGraph
            rule={rule}
            context={props.context}
            journal={journal}
            usage={usage}
            onOpenAccount={props.onOpenAccount}
            onViewTransactions={() => props.onViewTransactions(rule.displayId)}
          />
          <aside className="studio-side">
            <section className="studio-why">
              <div className="studio-kicker">Why this transformation?</div>
              <dl>
                <div>
                  <dt>Matches</dt>
                  <dd>
                    {rule.conditionDetails.map((condition) => (
                      <div key={`${condition.field}-${condition.value}`}>{humanCondition(condition)}</div>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt>Treatment</dt>
                  <dd>
                    {rule.lines.map((line) => (
                      <div key={`${line.side}-${line.accountCode}`}>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName}</div>
                    ))}
                  </dd>
                </div>
                <div><dt>Priority</dt><dd>{rule.priority} · higher wins when more than one transformation matches</dd></div>
                <div>
                  <dt>Effective</dt>
                  <dd>{policy === null ? 'Not in a live policy' : `Policy v${policy.version} · Active`}</dd>
                </div>
                <div>
                  <dt>Usage</dt>
                  <dd>
                    {usage.count === 0
                      ? '0 transactions · ₹0 accounted'
                      : `${usage.count} transaction${usage.count === 1 ? '' : 's'} · ${rupee(usage.accounted)} accounted`}
                  </dd>
                </div>
                <div>
                  <dt>Conflicts</dt>
                  <dd className={overlap.tone === 'ok' ? 'ok' : 'warn'}>{overlap.tone === 'ok' ? '✓ ' : '⚠ '}{overlap.label}</dd>
                </div>
              </dl>
              <SimulationResult rule={rule} context={props.context} simulation={props.simulation} />
              <button className="lineage-link" type="button" onClick={() => setShowDsl((value) => !value)}>
                {showDsl ? 'Hide DSL' : 'View DSL'}
              </button>
              {showDsl ? (
                <pre className="studio-dsl">{policy === null ? 'No DSL compiled.' : dslForRule(policy.dsl, rule.name)}</pre>
              ) : null}
            </section>
            {teachOpen ? (
              <AskSutra snapshot={props.snapshot} onAsk={props.onTeach} variant="compact" />
            ) : (
              <button className="studio-teach-toggle" type="button" onClick={() => setTeachOpen(true)}>
                Teach Kanakku
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function AccountingGraph(props: {
  rule: EngineRuleView;
  context: EngineTransactionView | undefined;
  journal: EngineSnapshot['ledger'][number] | undefined;
  usage: { count: number; accounted: number };
  onOpenAccount: (accountCode: string) => void;
  onViewTransactions: () => void;
}): JSX.Element {
  const activity = props.rule.activity === null ? 'Activity' : activitySingular(props.rule.activity);
  const posted = props.usage.count > 0;
  const matchChips = props.rule.conditionDetails.filter((condition) => condition.field !== 'eventType' && condition.field !== 'type');
  return (
    <div className="studio-flow" aria-label="Accounting graph">
      <div className="studio-flow-node">
        <small>{activity}</small>
        <b>{props.context === undefined ? activity : props.context.counterparty}</b>
        <span>
          {props.context === undefined
            ? 'Configured match'
            : `${props.context.displayId} · ${rupee(props.context.amount)}`}
        </span>
        {matchChips.length > 0 ? (
          <ul className="studio-flow-chips">
            {matchChips.map((condition) => (
              <li key={`${condition.field}-${condition.value}`}>{humanCondition(condition)}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="studio-flow-node">
        <small>{props.rule.displayId}</small>
        <b>{props.rule.name}</b>
        <div className="studio-flow-fork">
          {props.rule.lines.map((line) => (
            <div className="studio-flow-arm" key={`${line.side}-${line.accountCode}`}>
              <strong>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName}</strong>
              <button type="button" className="lineage-link" onClick={() => props.onOpenAccount(line.accountCode)}>
                {line.accountCode}
              </button>
              <em>{line.amountLabel}</em>
            </div>
          ))}
        </div>
      </div>
      <div className="studio-flow-node">
        <small>Journal</small>
        <b>{props.journal?.journalDisplayId ?? 'Configured journal'}</b>
        <span>
          {props.journal === undefined
            ? `${props.rule.lines.length} lines · amounts from the event`
            : `${props.journal.balanced ? 'Balanced' : 'Held'} · ${rupee(props.journal.totalDebits)}`}
        </span>
      </div>
      <button type="button" className={`studio-flow-node${posted ? ' ok' : ''}`} onClick={props.onViewTransactions}>
        <small>Ledger</small>
        <b>{posted ? 'Posted to ledger' : 'Not posted yet'}</b>
        <span>
          {posted
            ? `${props.usage.count} transaction${props.usage.count === 1 ? '' : 's'} · ${rupee(props.usage.accounted)}`
            : 'No ledger usage for this transformation'}
        </span>
      </button>
    </div>
  );
}

function EditWorkbench(props: {
  snapshot: EngineSnapshot;
  rule: EngineRuleView;
  onAddCondition: (ruleId: string, field: string, op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN', value: string | number) => void;
  onAddLine: (ruleId: string, side: 'DEBIT' | 'CREDIT', accountCode: string) => void;
  onToggle: (ruleId: string) => void;
  onOpenAccount: (accountCode: string) => void;
}): JSX.Element {
  const [advanced, setAdvanced] = useState(false);
  const policy = props.snapshot.policy;
  return (
    <div className="studio-edit">
      <ConditionsSection rule={props.rule} onAdd={props.onAddCondition} />
      <LinesSection snapshot={props.snapshot} rule={props.rule} onAdd={props.onAddLine} onOpenAccount={props.onOpenAccount} />
      <section className="studio-block">
        <div className="studio-kicker">Account resolution</div>
        <p className="sub">Direct account on each journal line. Mapping sets and dimension derivation are not in the kernel yet.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Line</th><th>Account</th><th>Code</th><th>How</th></tr>
            </thead>
            <tbody>
              {props.rule.lines.map((line) => (
                <tr key={`${line.side}-${line.accountCode}`}>
                  <td>{line.side === 'DEBIT' ? 'DR' : 'CR'}</td>
                  <td>{line.accountName}</td>
                  <td>{line.accountCode}</td>
                  <td>Set on this transformation</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <button className="btn tiny ghost" type="button" onClick={() => setAdvanced((value) => !value)}>
        {advanced ? 'Hide advanced' : 'Advanced'}
      </button>
      {advanced ? (
        <section className="studio-block">
          <div className="studio-kicker">Advanced · inside the model, not extra pages</div>
          <dl className="studio-advanced">
            <div><dt>Account rules</dt><dd>Direct account only. Conditional account rules are not in the kernel yet.</dd></div>
            <div><dt>Mapping sets</dt><dd>Not in the kernel. Do not appear in navigation until they do.</dd></div>
            <div>
              <dt>Amount</dt>
              <dd>
                Live: transaction amount, fixed amount, attribute amount.
                {props.rule.lines.map((line) => (
                  <div key={`${line.side}-amt`}>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName} · {line.amountLabel}</div>
                ))}
                Percentage / calculated — not in the kernel yet.
              </dd>
            </div>
            <div><dt>Description</dt><dd>{props.rule.lines.some((line) => line.description !== null) ? props.rule.lines.map((line) => line.description).filter((text) => text !== null).join(' · ') : 'Static line text only. Template rules are not in the kernel yet.'}</dd></div>
            <div><dt>Supporting references</dt><dd>Not in the kernel yet.</dd></div>
            <div><dt>Priority</dt><dd>{props.rule.priority} · higher wins when multiple transformations match</dd></div>
            <div><dt>Effective dates</dt><dd>{policy === null ? 'No live policy' : `Policy-level · version ${policy.version}`}. Per-transformation calendars are not stored separately.</dd></div>
            <div>
              <dt>Lifecycle</dt>
              <dd>
                {props.rule.enabled ? 'Included in the live ACTIVE policy' : 'Disabled — not compiled'}
                <button className="lineage-link" type="button" onClick={() => props.onToggle(props.rule.displayId)}>
                  {props.rule.enabled ? 'Turn off' : 'Turn on'}
                </button>
              </dd>
            </div>
            <div>
              <dt>DSL</dt>
              <dd>
                <pre className="studio-dsl">{policy === null ? 'No DSL compiled.' : dslForRule(policy.dsl, props.rule.name)}</pre>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function ConditionsSection(props: {
  rule: EngineRuleView;
  onAdd: (ruleId: string, field: string, op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN', value: string | number) => void;
}): JSX.Element {
  const [field, setField] = useState('counterparty');
  const [op, setOp] = useState<'=' | '!=' | '>' | '>=' | '<' | '<=' | 'IN'>('=');
  const [value, setValue] = useState('');
  return (
    <section className="studio-block">
      <div className="studio-kicker">When</div>
      <div className="studio-when">
        {props.rule.conditionDetails.map((condition) => (
          <div className="studio-when-row" key={`${condition.field}-${condition.op}-${condition.value}`}>
            <span>{humanCondition(condition)}</span>
          </div>
        ))}
      </div>
      <form
        className="studio-add"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          const parsed = field === 'amount'
            ? Number(value)
            : field === 'eventType'
              ? (value.trim() || 'PURCHASE')
              : value.trim();
          if (typeof parsed === 'string' && parsed.length === 0) {
            return;
          }
          if (typeof parsed === 'number' && !Number.isFinite(parsed)) {
            return;
          }
          props.onAdd(props.rule.displayId, field, op, parsed);
          setValue(field === 'eventType' ? 'PURCHASE' : '');
        }}
      >
        <select value={field} onChange={(event) => {
          const next = event.target.value;
          setField(next);
          setValue(next === 'eventType' ? 'PURCHASE' : '');
        }}>
          <option value="eventType">Activity</option>
          <option value="counterparty">Counterparty</option>
          <option value="amount">Amount</option>
        </select>
        <select value={op} onChange={(event) => setOp(event.target.value as typeof op)}>
          <option value="=">equals</option>
          <option value="!=">does not equal</option>
          <option value=">">greater than</option>
          <option value=">=">at least</option>
          <option value="<">less than</option>
          <option value="<=">at most</option>
          <option value="IN">is one of</option>
        </select>
        {field === 'eventType' ? (
          <select value={value || 'PURCHASE'} onChange={(event) => setValue(event.target.value)}>
            <option value="PURCHASE">Purchase</option>
            <option value="PAYMENT">Payment</option>
            <option value="REFUND">Refund</option>
            <option value="USAGE">Usage</option>
          </select>
        ) : (
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={field === 'amount' ? '1000' : 'Starbucks'} />
        )}
        <button className="btn tiny" type="submit">Add condition</button>
      </form>
    </section>
  );
}

function LinesSection(props: {
  snapshot: EngineSnapshot;
  rule: EngineRuleView;
  onAdd: (ruleId: string, side: 'DEBIT' | 'CREDIT', accountCode: string) => void;
  onOpenAccount: (accountCode: string) => void;
}): JSX.Element {
  const [side, setSide] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [accountCode, setAccountCode] = useState(props.snapshot.accountBalances[0]?.code ?? '');
  return (
    <section className="studio-block">
      <div className="studio-kicker">Then · journal lines</div>
      <div className="studio-lines">
        {props.rule.lines.map((line) => (
          <article key={`${line.side}-${line.accountCode}`} className="studio-line">
            <header>
              <b>{line.side === 'DEBIT' ? 'DR' : 'CR'} {line.accountName}</b>
              <button className="lineage-link" type="button" onClick={() => props.onOpenAccount(line.accountCode)}>
                {accountTypeLabel(line.accountType)} · {line.accountCode}
              </button>
            </header>
            <div className="meta">Amount: {line.amountLabel}</div>
          </article>
        ))}
      </div>
      <form
        className="studio-add"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (accountCode.length === 0) {
            return;
          }
          props.onAdd(props.rule.displayId, side, accountCode);
        }}
      >
        <select value={side} onChange={(event) => setSide(event.target.value as 'DEBIT' | 'CREDIT')}>
          <option value="DEBIT">Debit</option>
          <option value="CREDIT">Credit</option>
        </select>
        <select value={accountCode} onChange={(event) => setAccountCode(event.target.value)}>
          {props.snapshot.accountBalances.map((account) => (
            <option key={account.accountId} value={account.code}>{account.code} {account.name}</option>
          ))}
        </select>
        <button className="btn tiny" type="submit">Add journal line</button>
      </form>
    </section>
  );
}

function SimulationResult(props: {
  rule: EngineRuleView;
  context: EngineTransactionView | undefined;
  simulation: EngineSimulationView | null;
}): JSX.Element {
  const sim = props.simulation;
  if (sim === null) {
    return (
      <p className="sub studio-sim-empty">
        Simulate to test this transformation without posting.
        {props.context === undefined ? ' Input is derived from the match conditions.' : ''}
      </p>
    );
  }
  return (
    <div className="studio-sim-result">
      <div className="studio-kicker">Simulation</div>
      <p className="sub">
        {sim.source === 'transaction' && props.context !== undefined
          ? `${props.context.counterparty} ${rupee(props.context.amount)}`
          : `${sim.merchant} ${rupee(sim.amount)} · from conditions`}
        . Does not post.
      </p>
      <ul className="tx-checks">
        <li className={sim.matched ? 'ok' : 'warn'}>{sim.matched ? `Matched ${sim.selectedRuleDisplayId ?? ''}` : 'Not matched'}</li>
        <li className={sim.conditionsSatisfied ? 'ok' : 'warn'}>{sim.conditionsSatisfied ? 'This transformation selected' : 'Another transformation won, or none matched'}</li>
        <li className={sim.balanced ? 'ok' : 'warn'}>{sim.balanced ? 'Journal balanced' : 'Not balanced'}</li>
      </ul>
      {sim.selectedRuleDisplayId !== null && sim.selectedRuleDisplayId !== props.rule.displayId ? (
        <p className="notice">Engine selected {sim.selectedRuleDisplayId} {sim.selectedRuleName}, not {props.rule.displayId}.</p>
      ) : null}
      {sim.lines.length > 0 ? (
        <div className="tx-jl">
          {sim.lines.map((line) => (
            <div className="row" key={`${line.accountCode}-${line.debit}-${line.credit}`}>
              <span>{line.debit > 0 ? 'DR' : 'CR'} {line.accountName}</span>
              <b>{rupee(line.debit > 0 ? line.debit : line.credit)}</b>
            </div>
          ))}
        </div>
      ) : null}
      <div className={`balance-ok${sim.wouldPost ? '' : ' warn'}`}>
        <span>{sim.wouldPost ? 'Would post' : 'Would not post'}</span>
        <span>{sim.balanced ? `${rupee(sim.totalDebits)} = ${rupee(sim.totalCredits)}` : (sim.error ?? sim.reason)}</span>
      </div>
    </div>
  );
}

function AskSutra(props: {
  snapshot: EngineSnapshot;
  onAsk: (instruction: string) => void;
  variant: 'hero' | 'compact';
  placeholder?: string;
}): JSX.Element {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const hero = props.variant === 'hero';

  function submit(instruction: string): void {
    const value = instruction.trim();
    if (value.length === 0) {
      return;
    }
    const intent = classifyStudioIntent(value, props.snapshot);
    if (intent.kind === 'teach') {
      const parsed = proposeAccounting(value, props.snapshot.accounts);
      if ('error' in parsed) {
        setHint(parsed.error);
        return;
      }
    }
    setHint(null);
    props.onAsk(value);
    setText('');
  }

  return (
    <form
      className={`studio-ask studio-ask-${props.variant}`}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        submit(text);
      }}
    >
      <label>
        <span>{hero ? 'Ask Kanakku' : 'Teach Kanakku'}</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={props.placeholder ?? (hero ? 'How should AWS infrastructure usage be accounted?' : 'Tell Kanakku what accounting should change…')}
        />
      </label>
      <button className="btn tiny" type="submit">{hero ? 'Ask Kanakku' : 'Teach'}</button>
      {hero ? (
        <div className="studio-ask-examples">
          <span>Try</span>
          {ASK_EXAMPLES.map((example) => (
            <button key={example.chip} type="button" onClick={() => setText(example.prompt)}>
              {example.chip}
            </button>
          ))}
        </div>
      ) : null}
      {hint !== null ? <p className="sub">{hint}</p> : null}
    </form>
  );
}

function CommandPalette(props: {
  snapshot: EngineSnapshot;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  onPick: (hit: StudioSearchHit) => void;
  onAsk: (instruction: string) => void;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchStudioModel(props.snapshot, props.query), [props.snapshot, props.query]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [props.query]);

  function move(delta: number): void {
    if (hits.length === 0) {
      return;
    }
    setActive((index) => (index + delta + hits.length) % hits.length);
  }

  function choose(hit?: StudioSearchHit): void {
    const selected = hit ?? hits[active];
    if (selected === undefined) {
      if (props.query.trim().length > 0) {
        props.onClose();
        props.onAsk(props.query);
      }
      return;
    }
    props.onPick(selected);
  }

  return (
    <div className="studio-command" role="dialog" aria-label="Search accounting model">
      <button className="studio-command-scrim" type="button" aria-label="Close search" onClick={props.onClose} />
      <div className="studio-command-dialog">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            choose();
          }}
        >
          <input
            ref={inputRef}
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                props.onClose();
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                move(1);
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                move(-1);
              }
            }}
            placeholder="Search accounting model, or ask Kanakku…"
            aria-label="Search accounting model"
          />
        </form>
        <ul>
          {hits.length === 0 ? (
            <li className="studio-command-empty">No matching transformations, activities, accounts, sources, or versions.</li>
          ) : hits.map((hit, index) => (
            <li key={hit.id}>
              <button type="button" className={index === active ? 'active' : ''} onClick={() => choose(hit)}>
                <small>{commandKindLabel(hit.kind)}</small>
                <b>{hit.title}</b>
                <span>{hit.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="studio-command-hint">Ask to create or change accounting. Search to find it. Enter selects.</p>
      </div>
    </div>
  );
}

function commandKindLabel(kind: StudioSearchHit['kind']): string {
  if (kind === 'transformation') {
    return 'Rule';
  }
  if (kind === 'activity') {
    return 'Activity';
  }
  if (kind === 'account') {
    return 'Account';
  }
  if (kind === 'source') {
    return 'Source';
  }
  if (kind === 'version') {
    return 'Policy';
  }
  return 'Ask';
}
