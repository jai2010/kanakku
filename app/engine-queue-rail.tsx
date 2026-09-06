import { FormEvent } from 'react';
import { DemoGroup } from './engine-demo-groups';
import { MerchantMark } from './engine-machine';
import { EngineEventType, EngineExampleView, rupee, typeLabel } from './engine-types';

export type LiveQueueItem = {
  id: string;
  example: EngineExampleView;
  status: 'waiting' | 'processing';
};

export function EngineQueueRail(props: {
  queue: LiveQueueItem[];
  groups: DemoGroup[];
  composerOpen: boolean;
  merchant: string;
  amount: string;
  type: EngineEventType;
  department: string;
  busy: boolean;
  onMerchant: (value: string) => void;
  onAmount: (value: string) => void;
  onType: (value: EngineEventType) => void;
  onDepartment: (value: string) => void;
  onToggleComposer: () => void;
  onShowDemos: () => void;
  onUpload: () => void;
  onSend: (event: FormEvent) => void;
  onDemo: (example: EngineExampleView) => void;
}): JSX.Element {
  return (
    <aside className="panel side-col live-queue">
      <div className="queue-block">
        <h2>Incoming · {props.queue.length}</h2>
        <div className="sub">Transactions arriving at Kanakku.</div>
        {props.queue.length === 0 ? (
          <div className="queue-empty">Nothing waiting.</div>
        ) : (
          <div className="tx-list">
            {props.queue.map((item) => (
              <div
                key={item.id}
                className={`tx queue-card${item.status === 'processing' ? ' sel' : ''}`}
              >
                <MerchantMark mark={item.example.mark} tint={item.example.tint} />
                <div>
                  <div className="name">{item.example.merchant}</div>
                  <div className="meta">{item.example.category}</div>
                </div>
                <div className="queue-amt">
                  <div className="amt">{rupee(item.example.amount, item.example.type)}</div>
                  <span className={`queue-status ${item.status}`}>
                    {item.status === 'processing' ? 'Processing' : 'Waiting'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="send-block">
        <button className="send-toggle" type="button" onClick={props.onToggleComposer}>
          + Send a transaction
        </button>
        <div className="send-ways">
          <button type="button" className={!props.composerOpen ? 'on' : ''} onClick={props.onShowDemos}>Demo</button>
          <button type="button" className={props.composerOpen ? 'on' : ''} onClick={props.onToggleComposer}>Generate</button>
          <button type="button" onClick={props.onUpload}>Upload</button>
        </div>
        {props.composerOpen ? (
          <form className="form" onSubmit={props.onSend}>
            <div className="label">Merchant / Counterparty</div>
            <input value={props.merchant} onChange={(event) => props.onMerchant(event.target.value)} placeholder="e.g. Spotify" />
            <div className="label">Amount</div>
            <input value={props.amount} onChange={(event) => props.onAmount(event.target.value)} inputMode="decimal" placeholder="₹ 0.00" />
            <div className="label">Type</div>
            <select value={props.type} onChange={(event) => props.onType(event.target.value as EngineEventType)}>
              <option value="PURCHASE">Purchase</option>
              <option value="REFUND">Refund</option>
              <option value="PAYMENT">Payment</option>
              <option value="USAGE">Usage</option>
              <option value="WALLET_LOAD">Wallet Load</option>
              <option value="WALLET_SPEND">Wallet Purchase</option>
              <option value="MARKETPLACE_SALE">Marketplace Sale</option>
              <option value="SELLER_PAYOUT">Payout</option>
            </select>
            <div className="label">Department</div>
            <select value={props.department} onChange={(event) => props.onDepartment(event.target.value)}>
              <option value="">Select</option>
              <option>Finance</option>
              <option>Engineering</option>
              <option>Sales</option>
              <option>Operations</option>
            </select>
            <button className="btn" type="submit" disabled={props.busy}>Send into the engine</button>
          </form>
        ) : null}
      </div>

      <div className="demo-block" id="engine-demos">
        <h2>Try a demo</h2>
        {props.groups.map((group) => (
          <div className="demo-group" key={group.id}>
            <h3>{group.label}</h3>
            {group.examples.map((example) => (
              <button
                key={example.key}
                type="button"
                className="tx demo-tx"
                onClick={() => props.onDemo(example)}
              >
                <MerchantMark mark={example.mark} tint={example.tint} />
                <div>
                  <div className="name">{example.merchant}</div>
                  <div className="meta">{typeLabel(example.type)}</div>
                </div>
                <div className="amt">{rupee(example.amount, example.type)}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export function makeQueueItem(example: EngineExampleView): LiveQueueItem {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    example,
    status: 'waiting'
  };
}
