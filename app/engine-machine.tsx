import type { CSSProperties } from 'react';
import { policyBookName } from './engine-demo-groups';
import { EngineProcessResult, EngineStageId, rupee, signedRupee, typeLabel } from './engine-types';

export const CHAMBERS: Array<{
  id: EngineStageId;
  kicker: string;
  title: string;
  glow: string;
  icon: string;
}> = [
  { id: 'policy', kicker: 'POLICY', title: 'RESOLVER', glow: '#39a8ff', icon: 'layers' },
  { id: 'rules', kicker: 'RULE', title: 'EVALUATION', glow: '#a970ff', icon: 'branch' },
  { id: 'accounts', kicker: 'EFFECT', title: 'TRANSACTIONAL', glow: '#2ce38a', icon: 'stack' },
  { id: 'journal', kicker: 'JOURNAL', title: 'ACCOUNTING', glow: '#ffb547', icon: 'doc' },
  { id: 'validator', kicker: 'VALIDATOR', title: 'BALANCE', glow: '#36e0d0', icon: 'shield' },
  { id: 'ledger', kicker: 'LEDGER', title: 'POSTING', glow: '#4d8dff', icon: 'db' }
];

export const STAGE_TITLES = [
  'Policy Resolver',
  'Rule Evaluation',
  'Transactional Effect',
  'Accounting',
  'Validation',
  'Ledger Posting'
] as const;

export const STAGE_HINTS = [
  'Review the resolved policy.',
  'Review the matched transformation.',
  'Review the operational effect.',
  'Review the journal.',
  'Confirm the books balance.',
  'Posted to the ledger.'
] as const;

export function EngineMachine(props: {
  result: EngineProcessResult | null;
  activeIndex: number;
  running: boolean;
  animating: boolean;
  mode: 'live' | 'step';
  onStep: () => void;
}): JSX.Element {
  const particleClass = props.running && props.mode === 'live'
    ? 'particle run'
    : props.activeIndex >= 0
      ? 'particle step'
      : 'particle';
  const particleLeft = props.activeIndex >= 0 && !(props.running && props.mode === 'live')
    ? `${8 + Math.min(props.activeIndex, 5) * 16.4}%`
    : undefined;

  return (
    <section className="machine" aria-label="Kanakku accounting engine">
      <div className="machine-grid" />
      {props.result !== null ? (
        <div className="float-card in">
          <MerchantMark mark={props.result.mark} tint={props.result.tint} />
          <div>
            <b>{props.result.merchant}</b>
            <small>{rupee(props.result.amount, props.result.type)} · {typeLabel(props.result.type)}</small>
          </div>
        </div>
      ) : null}
      {props.result?.journal !== null && props.result !== null && props.activeIndex >= 5 ? (
        <div className="float-card out">
          <div>
            <b>Posted</b>
            <small>{props.result.journal.displayId}</small>
          </div>
        </div>
      ) : null}
      <div className="stream in" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="stream out" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="pipe" />
      <div className={particleClass} style={particleLeft === undefined ? undefined : { left: particleLeft, opacity: 1 }} />
      <MachineLegend result={props.result} activeIndex={props.activeIndex} animating={props.animating} />
      <div className="chambers">
        {CHAMBERS.map((chamber, index) => {
          const stage = props.result?.stages[index];
          const plate = plateCopy(props.result, index, props.activeIndex);
          let state = 'chamber';
          if (props.result !== null && props.activeIndex === index && props.animating) {
            state += stage?.tone === 'warn' ? ' warn' : ' active';
          } else if (props.result !== null && (props.activeIndex > index || (props.activeIndex === index && !props.animating))) {
            state += stage?.tone === 'warn' ? ' warn done' : ' done';
          }
          return (
            <button
              key={chamber.id}
              type="button"
              className={state}
              style={{ '--glow': chamber.glow } as CSSProperties}
              onClick={props.onStep}
              aria-current={props.activeIndex === index}
              aria-label={`${chamber.kicker} ${chamber.title}`}
            >
              <div className="chamber-mech" aria-hidden="true">
                <span className="bore" />
                <span className="rod" />
                <span className="wash" />
              </div>
              <div className="orb" />
              <div className="sym"><StageIcon name={chamber.icon} /></div>
              <b>{chamber.kicker}</b>
              <b>{chamber.title}</b>
              <div className="plate">
                <strong>{plate.headline}</strong>
                {plate.detail}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function StageTheater(props: {
  result: EngineProcessResult | null;
  activeIndex: number;
  running: boolean;
}): JSX.Element {
  const chamber = CHAMBERS[Math.max(props.activeIndex, 0)];
  const result = props.result;
  const idle = result === null;
  let body: JSX.Element;
  if (idle) {
    body = (
      <div className="theater-idle">
        <p>{props.running ? 'Transaction arriving.' : 'Nothing is waiting.'}</p>
        {props.running ? null : <p>Send a transaction to watch Kanakku work.</p>}
      </div>
    );
  } else if (props.activeIndex === 0) {
    body = <PolicyDetail result={result} />;
  } else if (props.activeIndex === 1) {
    body = <RuleDetail result={result} />;
  } else if (props.activeIndex === 2) {
    body = <TransactionalDetail result={result} />;
  } else if (props.activeIndex === 3) {
    body = <JournalDetail result={result} />;
  } else if (props.activeIndex === 4) {
    body = <ValidatorDetail result={result} />;
  } else {
    body = <LedgerDetail result={result} />;
  }

  return (
    <section className={`stage-theater${idle ? ' idle' : ''}`} aria-live="polite">
      <div className="theater-head">
        <div className="result-kicker">
          {idle ? 'Engine ready' : `Active stage · ${chamber?.kicker} ${chamber?.title}`}
        </div>
        {!idle && result !== null ? (
          <div className="theater-who">
            <b>{result.merchant}</b>
            <small>{typeLabel(result.type)} · {rupee(result.amount, result.type)}</small>
          </div>
        ) : null}
      </div>
      {body}
    </section>
  );
}

function MachineLegend(props: {
  result: EngineProcessResult | null;
  activeIndex: number;
  animating: boolean;
}): JSX.Element {
  const labels = ['POLICY', 'RULES', 'EFFECT', 'JOURNAL', 'VALIDATOR', 'LEDGER'] as const;
  return (
    <div className="legend" aria-hidden="true">
      {labels.map((label, index) => {
        const done = props.result !== null && (props.activeIndex > index || (props.activeIndex === index && !props.animating));
        const active = props.result !== null && props.activeIndex === index && props.animating;
        return (
          <span key={label} className={active ? 'on' : done ? 'done' : ''}>
            {index > 0 ? <i>→</i> : null}
            {label}{done ? ' ✓' : active ? ' ●' : ''}
          </span>
        );
      })}
    </div>
  );
}

function plateCopy(result: EngineProcessResult | null, index: number, revealed: number): { headline: string; detail: string } {
  if (result === null || revealed < index) {
    return { headline: '—', detail: 'waiting' };
  }
  if (index === 0) {
    return { headline: '1', detail: 'active policy' };
  }
  if (index === 1) {
    const rule = result.evaluation.selectedRule;
    if (rule === null) {
      return { headline: 'No match', detail: 'unmatched' };
    }
    return { headline: rule.displayId, detail: rule.name };
  }
  if (index === 2) {
    const transactional = result.transactional;
    if (transactional === null) {
      return { headline: 'Financial', detail: 'no operational' };
    }
    const count = transactional.effects.length;
    return {
      headline: signedRupee(transactional.composition.total),
      detail: `${count} ${count === 1 ? 'entry' : 'entries'}`
    };
  }
  if (index === 3) {
    const journal = result.journal;
    if (journal === null) {
      return { headline: 'No journal', detail: 'held' };
    }
    const count = journal.lines.length;
    return {
      headline: `${count} ${count === 1 ? 'line' : 'lines'}`,
      detail: rupee(journal.totalDebits)
    };
  }
  if (index === 4) {
    const journal = result.journal;
    return {
      headline: journal?.balanced === true ? 'BALANCED' : 'CHECK',
      detail: 'DR = CR'
    };
  }
  const journal = result.journal;
  return {
    headline: journal?.posted === true ? 'POSTED' : 'HELD',
    detail: journal?.displayId ?? '—'
  };
}

function PolicyDetail(props: { result: EngineProcessResult }): JSX.Element {
  return (
    <div className="theater-body compact">
      <div className="stage-status ok">✓ Resolved</div>
      <div className="rule-name">{policyBookName(props.result.type)}</div>
      <span className="meta">1 active policy · {typeLabel(props.result.type)}</span>
    </div>
  );
}

function RuleDetail(props: { result: EngineProcessResult }): JSX.Element {
  const rule = props.result.evaluation.selectedRule;
  if (rule === null) {
    return (
      <div className="theater-body compact">
        <div className="stage-status warn">No match</div>
        <div className="rule-name">No rule</div>
      </div>
    );
  }
  return (
    <div className="theater-body compact">
      <div className="stage-status ok">✓ Matched · {rule.displayId} · {rule.name}</div>
      <ul className="conds inspector-conds">
        {rule.conditions.slice(0, 3).map((condition) => <li key={condition}>{condition}</li>)}
      </ul>
      <span className="meta">Priority {rule.priority}</span>
    </div>
  );
}

function TransactionalDetail(props: { result: EngineProcessResult }): JSX.Element {
  const transactional = props.result.transactional;
  if (transactional === null) {
    return (
      <div className="theater-body compact">
        <div className="stage-status">Financial only</div>
        <span className="meta">No operational balance on this transaction.</span>
      </div>
    );
  }
  return (
    <div className="theater-body compact">
      <div className="stage-status ok">{transactional.participantName}</div>
      <ul className="result-ops inspector-ops">
        {transactional.composition.lines.map((line) => (
          <li key={`${line.type}-${line.description}`}>
            <span>{line.description}</span>
            <b>{signedRupee(line.signedAmount)}</b>
          </li>
        ))}
      </ul>
      <div className="result-net">
        <span>{transactional.participantKind === 'SELLER' ? 'Seller balance' : 'Wallet'}</span>
        <b>{rupee(Math.abs(transactional.composition.total))}</b>
      </div>
    </div>
  );
}

function JournalDetail(props: { result: EngineProcessResult }): JSX.Element {
  const journal = props.result.journal;
  if (journal === null) {
    return (
      <div className="theater-body compact">
        <div className="stage-status warn">No journal</div>
      </div>
    );
  }
  return (
    <div className="theater-body compact">
      <div className="result-journal inspector-journal">
        {journal.lines.map((line) => (
          <div className="row" key={`${line.accountCode}-${line.debit}-${line.credit}`}>
            <span>{line.debit > 0 ? 'DR' : 'CR'} {line.accountName}</span>
            <b>{rupee(line.debit > 0 ? line.debit : line.credit)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidatorDetail(props: { result: EngineProcessResult }): JSX.Element {
  const journal = props.result.journal;
  const debit = journal?.totalDebits ?? 0;
  const credit = journal?.totalCredits ?? 0;
  const balanced = journal?.balanced === true;
  return (
    <div className="theater-body compact">
      <div className={`balance-chamber compact${balanced ? ' ok' : ' warn'}`}>
        <div>
          <small>Debit</small>
          <b>{rupee(debit)}</b>
        </div>
        <div className="balance-seal">{balanced ? '✓ Balanced' : 'Check'}</div>
        <div>
          <small>Credit</small>
          <b>{rupee(credit)}</b>
        </div>
      </div>
    </div>
  );
}

function LedgerDetail(props: { result: EngineProcessResult }): JSX.Element {
  const journal = props.result.journal;
  if (journal === null) {
    return (
      <div className="theater-body compact">
        <div className="stage-status warn">Held</div>
        <span className="meta">{props.result.error ?? 'Not posted.'}</span>
      </div>
    );
  }
  return (
    <div className="theater-body compact">
      <div className="stage-status ok">✓ Posted · {journal.displayId}</div>
      <span className="meta">{journal.lines.length} lines · {rupee(journal.totalDebits)}</span>
    </div>
  );
}

export function MerchantMark(props: { mark: string; tint: string }): JSX.Element {
  return (
    <div className="merchant-mark" style={{ background: props.tint }} aria-hidden="true">
      {labelFor(props.mark)}
    </div>
  );
}

function labelFor(mark: string): string {
  if (mark === 'sb') return '★';
  if (mark === 'az') return 'a';
  if (mark === 'ub') return 'U';
  if (mark === 'aws') return 'aws';
  if (mark === 'ec2') return 'ec2';
  if (mark === 's3') return 's3';
  if (mark === 'ai') return '✈';
  if (mark === 'od') return '▣';
  if (mark === 'rf') return '↩';
  if (mark === 'bk') return '⌂';
  if (mark === 'ae') return 'Ae';
  if (mark === 'tw') return 'Tw';
  if (mark === 'fh') return 'Fh';
  if (mark === 'pr') return 'P';
  if (mark === 'al') return 'A';
  if (mark === 'sm') return 'S';
  return mark.slice(0, 2).toUpperCase();
}

function StageIcon(props: { name: string }): JSX.Element {
  const common = { width: 34, height: 34, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
  if (props.name === 'layers') {
    return <svg {...common} viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Zm0 18 9-5-9-5-9 5 9 5Z" /></svg>;
  }
  if (props.name === 'branch') {
    return <svg {...common} viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M8 7.2c2 3 6 3 8 0M12 16V10" /></svg>;
  }
  if (props.name === 'stack') {
    return <svg {...common} viewBox="0 0 24 24"><path d="M4 8h16M4 12h16M4 16h16" /><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
  }
  if (props.name === 'doc') {
    return <svg {...common} viewBox="0 0 24 24"><path d="M7 3h8l5 5v13H7z" /><path d="M15 3v5h5M9 13h8M9 17h6" /></svg>;
  }
  if (props.name === 'shield') {
    return <svg {...common} viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  }
  return <svg {...common} viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
}
