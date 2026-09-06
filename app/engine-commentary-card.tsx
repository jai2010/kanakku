import { Commentary, WAITER_PORTRAITS } from './engine-commentary';

export function SutraCommentary(props: {
  commentary: Commentary;
  empty: boolean;
  onSend?: () => void;
}): JSX.Element {
  return (
    <section className={`commentary${props.empty ? ' empty' : ''}`} aria-live="polite">
      <div className="waiter-portrait" aria-hidden="true">
        <img
          src={WAITER_PORTRAITS[props.commentary.mood]}
          alt=""
          width={160}
          height={240}
        />
      </div>
      <div className="commentary-copy">
        <div className="result-kicker">Kanakku Commentary</div>
        <blockquote>“{props.commentary.line}”</blockquote>
      </div>
    </section>
  );
}
