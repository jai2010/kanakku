import { EngineService } from '../../src/application/playground/EngineService';
import { proposeAccounting } from '../../app/studio-model';

describe('marketplace dual effect', () => {
  it('posts financial journals and seller operational entries from the same sale', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Acme Electronics',
      amount: 10000,
      type: 'MARKETPLACE_SALE',
      category: 'Marketplace Sale',
      remember: false,
      attributes: { sellerId: 'S001', orderId: 'ORD-1001' }
    });
    const result = snapshot.lastResult;
    expect(result?.evaluation.selectedRule?.displayId).toBe('R125');
    expect(result?.journal?.balanced).toBe(true);
    expect(result?.transactional?.participantId).toBe('S001');
    expect(result?.transactional?.composition.total).toBe(8600);
    expect(result?.transactional?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SALE', signedAmount: 10000 }),
      expect.objectContaining({ type: 'FEE', signedAmount: -500 }),
      expect.objectContaining({ type: 'TAX', signedAmount: -900 })
    ]));
    const payable = snapshot.accountBalances.find((row) => row.code === '2110');
    expect(payable).toMatchObject({ name: 'Seller Payable', balance: 8600, balanceSide: 'CREDIT' });
    const acme = snapshot.participants.find((row) => row.participantId === 'S001');
    expect(acme?.balance).toBe(8600);
  });

  it('keeps seller balances independent', async () => {
    const engine = EngineService.createLive();
    await engine.process({
      merchant: 'Acme Electronics',
      amount: 10000,
      type: 'MARKETPLACE_SALE',
      remember: false,
      attributes: { sellerId: 'S001' }
    });
    const snapshot = await engine.process({
      merchant: 'TechWorld',
      amount: 5000,
      type: 'MARKETPLACE_SALE',
      remember: false,
      attributes: { sellerId: 'S002' }
    });
    expect(snapshot.participants.find((row) => row.participantId === 'S001')?.balance).toBe(8600);
    expect(snapshot.participants.find((row) => row.participantId === 'S002')?.balance).toBe(4300);
  });

  it('tracks a buyer wallet from immutable load and spend entries', async () => {
    const engine = EngineService.createLive();
    await engine.process({ merchant: 'Priya', amount: 10000, type: 'WALLET_LOAD', remember: false, attributes: { buyerId: 'B001' } });
    await engine.process({ merchant: 'Priya', amount: 2500, type: 'WALLET_SPEND', remember: false, attributes: { buyerId: 'B001' } });
    const snapshot = await engine.process({ merchant: 'Priya', amount: 1200, type: 'WALLET_SPEND', remember: false, attributes: { buyerId: 'B001' } });
    expect(snapshot.participants.find((row) => row.participantId === 'B001')?.balance).toBe(6300);
    const wallet = snapshot.accountBalances.find((row) => row.code === '2300');
    expect(wallet).toMatchObject({ name: 'Buyer Wallet', balance: 6300, balanceSide: 'CREDIT' });
  });

  it('clears a seller operational balance on payout without mixing into other sellers', async () => {
    const engine = EngineService.createLive();
    await engine.process({
      merchant: 'FashionHub',
      amount: 2000,
      type: 'MARKETPLACE_SALE',
      remember: false,
      attributes: { sellerId: 'S003' }
    });
    const snapshot = await engine.process({
      merchant: 'FashionHub',
      amount: 1720,
      type: 'SELLER_PAYOUT',
      remember: false,
      attributes: { sellerId: 'S003' }
    });
    expect(snapshot.participants.find((row) => row.participantId === 'S003')?.balance).toBe(0);
    expect(snapshot.lastResult?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '2110', debit: 1720 }),
      expect.objectContaining({ accountCode: '1010', credit: 1720 })
    ]));
  });

  it('seeds the marketplace demo so clone-and-run is immediately visible', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.seedDemo();
    expect(snapshot.participants.find((row) => row.participantId === 'B001')?.balance).toBe(6300);
    expect(snapshot.participants.find((row) => row.participantId === 'S001')?.balance).toBe(8600);
    expect(snapshot.participants.find((row) => row.participantId === 'S002')?.balance).toBe(4300);
    expect(snapshot.participants.find((row) => row.participantId === 'S003')?.balance).toBe(0);
    expect(snapshot.lastResult?.evaluation.selectedRule?.displayId).toBe('R125');
    expect(snapshot.transactions.some((row) => row.type === 'PURCHASE' && row.counterparty === 'Starbucks')).toBe(true);
    const acme = snapshot.participantLedgers.find((row) => row.participantId === 'S001');
    expect(acme?.entries.map((entry) => [entry.description, entry.signedAmount, entry.runningBalance])).toEqual([
      ['Gross sale', 10000, 10000],
      ['Marketplace fee', -500, 9500],
      ['Tax', -900, 8600]
    ]);
  });
});

describe('studio seller and wallet intent', () => {
  it('interprets seller payout intent as transactional plus accounting, without executing it', () => {
    const accounts = EngineService.createLive().snapshot().accounts;
    const proposal = proposeAccounting(
      'Track what each seller is owed from marketplace sales. Deduct a 5% marketplace fee and 18% tax before showing the seller\'s eligible payout.',
      accounts
    );
    expect('error' in proposal).toBe(false);
    if ('error' in proposal) {
      return;
    }
    expect(proposal.activity).toBe('MARKETPLACE_SALE');
    expect(proposal.transactional?.participantKind).toBe('SELLER');
    expect(proposal.transactional?.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SALE' }),
      expect.objectContaining({ type: 'FEE', amount: { type: 'RATE', rate: 0.05 } }),
      expect.objectContaining({ type: 'TAX', amount: { type: 'RATE', rate: 0.18 } })
    ]));
    expect(proposal.lines.some((line) => line.accountName === 'Seller Payable' && line.exists)).toBe(true);
  });

  it('interprets wallet load intent as a buyer operational treatment', () => {
    const accounts = EngineService.createLive().snapshot().accounts;
    const proposal = proposeAccounting('Track wallet balances for every buyer. When a buyer loads money, increase their wallet.', accounts);
    expect(proposal).toMatchObject({
      activity: 'WALLET_LOAD',
      transactional: { participantKind: 'BUYER' }
    });
  });
});
