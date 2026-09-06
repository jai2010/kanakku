import { MerchantMark } from './engine-machine';
import {
  EngineExampleView,
  EngineProcessResult,
  rupee,
  signedRupee,
  typeLabel
} from './engine-types';

export function ResultPanel(props: {
  selected: EngineExampleView | undefined;
  result: EngineProcessResult | null;
  revealed: number;
  busy: boolean;
  onLedger: () => void;
  onTransaction: () => void;
  onJournal: () => void;
}): JSX.Element {
  const selected = props.selected;
  const result = props.result;
  const posted = props.revealed >= 5 && result?.journal?.posted === true;
  const held = result !== null && result.error !== null && props.revealed >= 1;
  const showOperational = props.revealed >= 2 && result?.transactional !== null && result !== null;
  const showAccounting = props.revealed >= 3 && result?.journal !== null && result !== null;
  const showBalance = props.revealed >= 4 && result?.journal !== null;

  let badge = 'Ready';
  let badgeClass = 'badge ready';
  if (props.busy || (props.revealed >= 0 && props.revealed < 5 && result !== null)) {
    badge = 'Processing';
    badgeClass = 'badge busy';
  } else if (posted) {
    badge = 'Posted';
    badgeClass = 'badge';
  } else if (held) {
    badge = 'Held';
    badgeClass = 'badge warn';
  }

  const merchant = result?.merchant ?? selected?.merchant;
  const amount = result?.amount ?? selected?.amount ?? 0;
  const type = result?.type ?? selected?.type;
  const category = result?.category ?? selected?.category;
  const mark = result?.mark ?? selected?.mark ?? 'tx';
  const tint = result?.tint ?? selected?.tint ?? '#3b82f6';

  return (
    <aside className="panel result-col result-story">
      <h2>Result <span className={badgeClass}>{badge}</span></h2>

      {merchant !== undefined && type !== undefined ? (
        <div className="txbig">
          <MerchantMark mark={mark} tint={tint} />
          <div>
            <b>{merchant}</b>
            <div className="amt">{rupee(amount, type)}</div>
            <span className="meta">{category !== undefined && category !== typeLabel(type) ? `${typeLabel(type)} · ${category}` : typeLabel(type)}</span>
          </div>
        </div>
      ) : (
        <p className="sub">Send a transaction. The result lands here.</p>
      )}

      {showOperational && result?.transactional !== null && result !== null ? (
        <section className="result-layer">
          <div className="result-kicker">What happened</div>
          <div className="rule-name">{result.transactional.participantName}</div>
          <div className="meta">{result.transactional.participantKind === 'SELLER' ? 'Seller balance' : 'Buyer wallet'}</div>
          <ul className="result-ops">
            {result.transactional.composition.lines.map((line) => (
              <li key={`${line.type}-${line.description}`}>
                <span>{line.description}</span>
                <b>{signedRupee(line.signedAmount)}</b>
              </li>
            ))}
          </ul>
          <div className="result-net">
            <span>{result.transactional.participantKind === 'SELLER' ? 'Seller balance' : 'Wallet'}</span>
            <b>{rupee(Math.abs(result.transactional.composition.total))}</b>
          </div>
        </section>
      ) : null}

      {showAccounting && result?.journal !== null && result !== null ? (
        <section className="result-layer">
          <div className="result-kicker">What Kanakku accounted</div>
          <div className="result-journal">
            {result.journal.lines.map((line) => (
              <div className="row" key={`${line.accountCode}-${line.debit}-${line.credit}`}>
                <span>{line.debit > 0 ? 'DR' : 'CR'} {line.accountName}</span>
                <b>{rupee(line.debit > 0 ? line.debit : line.credit)}</b>
              </div>
            ))}
          </div>
        </section>
      ) : result === null ? (
        <section className="result-layer">
          <div className="row"><span>Debit</span><b>—</b></div>
          <div className="row"><span>Credit</span><b>—</b></div>
        </section>
      ) : null}

      {showBalance && result?.journal !== null && result !== null ? (
        <div className={`balance-ok${result.journal.balanced ? '' : ' warn'}`}>
          <span>{result.journal.balanced ? 'Balanced' : 'Needs review'}</span>
          <span>{rupee(result.journal.totalDebits)} = {rupee(result.journal.totalCredits)}</span>
        </div>
      ) : null}

      {posted && result?.journal !== null && result !== null ? (
        <div className="result-posted">
          <div className="result-kicker">Posted</div>
          <div className="rule-name">{result.journal.displayId}</div>
          <div className="result-links">
            <button className="ledger-link" type="button" onClick={props.onTransaction}>View transaction</button>
            <button className="ledger-link" type="button" onClick={props.onJournal}>View journal</button>
            <button className="ledger-link" type="button" onClick={props.onLedger}>View ledger</button>
          </div>
        </div>
      ) : null}

      {held && result?.error !== null && result !== null ? (
        <div className="notice">{result.error}</div>
      ) : null}
    </aside>
  );
}
