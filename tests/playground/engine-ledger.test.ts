import { EngineService } from '../../src/application/playground/EngineService';

describe('Engine general ledger', () => {
  it('derives account balances from posted journals', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Starbucks',
      amount: 7800,
      type: 'PURCHASE',
      remember: false
    });
    const meals = snapshot.accountBalances.find((row) => row.code === '5220');
    const card = snapshot.accountBalances.find((row) => row.code === '2000');
    expect(meals).toMatchObject({ name: 'Business Meals', type: 'EXPENSE', balance: 7800, balanceSide: 'DEBIT', totalDebits: 7800 });
    expect(card).toMatchObject({ name: 'Corporate Card', type: 'LIABILITY', balance: 7800, balanceSide: 'CREDIT', totalCredits: 7800 });
    expect(snapshot.ledgerTotals.balanced).toBe(true);
    expect(snapshot.ledgerTotals.totalDebits).toBe(7800);
    expect(snapshot.ledgerTotals.totalCredits).toBe(7800);
  });

  it('accumulates a running balance on the account ledger', async () => {
    const engine = EngineService.createLive();
    await engine.process({ merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', remember: false });
    const snapshot = await engine.process({ merchant: 'Starbucks', amount: 2400, type: 'PURCHASE', remember: false });
    const meals = snapshot.accountLedgers.find((row) => row.code === '5220');
    expect(meals?.balance).toBe(10200);
    expect(meals?.entries.map((line) => line.runningBalance)).toEqual([7800, 10200]);
    expect(snapshot.ledger).toHaveLength(2);
  });

  it('produces a balanced trial balance after mixed activity', async () => {
    const engine = EngineService.createLive();
    await engine.process({ merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', remember: false });
    const snapshot = await engine.process({ merchant: 'AWS', amount: 82400, type: 'PURCHASE', remember: false });
    expect(snapshot.trialBalance.balanced).toBe(true);
    expect(snapshot.trialBalance.totalDebits).toBe(90200);
    expect(snapshot.trialBalance.totalCredits).toBe(90200);
    expect(snapshot.trialBalance.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: '5220', debit: 7800, credit: 0 }),
      expect.objectContaining({ code: '6100', debit: 82400, credit: 0 }),
      expect.objectContaining({ code: '2000', debit: 0, credit: 7800 }),
      expect.objectContaining({ code: '2100', debit: 0, credit: 82400 })
    ]));
  });

  it('attaches previous/next balance impact from the ledger, not the UI', async () => {
    const engine = EngineService.createLive();
    await engine.process({ merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', remember: false });
    const snapshot = await engine.process({ merchant: 'Starbucks', amount: 2400, type: 'PURCHASE', remember: false });
    expect(snapshot.lastResult?.balanceImpact).toEqual(expect.arrayContaining([
      expect.objectContaining({
        accountCode: '5220',
        debit: 2400,
        previousBalance: 7800,
        nextBalance: 10200,
        previousBalanceSide: 'DEBIT',
        nextBalanceSide: 'DEBIT'
      })
    ]));
  });

  it('advances the demo clock so running balances span distinct times', async () => {
    const engine = EngineService.createLive();
    await engine.process({ merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', remember: false });
    const snapshot = await engine.process({ merchant: 'Starbucks', amount: 2400, type: 'PURCHASE', remember: false });
    const meals = snapshot.accountLedgers.find((row) => row.code === '5220');
    expect(meals?.entries.map((line) => line.transactionDate)).toEqual([
      '2026-09-05T10:00:00.000Z',
      '2026-09-05T14:00:00.000Z'
    ]);
  });

  it('rates AWS EC2 usage and posts it to Cloud Infrastructure', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'AWS',
      amount: 0,
      type: 'USAGE',
      category: 'EC2 Compute',
      remember: false,
      usage: { meter: 'compute_hours', quantity: 10, unitPrice: 48, unit: 'hours' }
    });
    expect(snapshot.lastResult?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6200', debit: 480 }),
      expect.objectContaining({ accountCode: '2100', credit: 480 })
    ]));
    const tx = snapshot.transactions[0];
    expect(tx?.displayId).toBe('TX-2026-000001');
    expect(tx?.usage).toEqual({ meter: 'compute_hours', quantity: 10, unitPrice: 48, unit: 'hours' });
    expect(tx?.amount).toBe(480);
    expect(tx?.accountingStatus).toBe('ACCOUNTED');
    expect(tx?.selectedRuleName).toBe('AWS Infrastructure');
    expect(snapshot.accountBalances.find((row) => row.code === '6200')?.balance).toBe(480);
  });

  it('keeps unmatched usage on the transaction ledger without posting', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Unknown SaaS',
      amount: 0,
      type: 'USAGE',
      category: 'API calls',
      remember: false,
      usage: { meter: 'api_calls', quantity: 1000, unitPrice: 0.24, unit: 'calls' }
    });
    expect(snapshot.lastResult?.journal).toBeNull();
    expect(snapshot.transactions[0]?.pipeline.unmatched).toBe(true);
    expect(snapshot.transactions[0]?.accountingStatus).toBe('NOT_ACCOUNTED');
    expect(snapshot.ledger).toHaveLength(0);
  });

  it('replays a posted event through the engine without double-posting', async () => {
    const engine = EngineService.createLive();
    const posted = await engine.process({ merchant: 'Starbucks', amount: 7800, type: 'PURCHASE', remember: false });
    const eventId = posted.lastResult?.eventId;
    expect(eventId).toBeDefined();
    const replayed = engine.replay(eventId!);
    expect(replayed.metrics.posted).toBe(1);
    expect(replayed.lastResult?.eventId).toBe(eventId);
    expect(replayed.accountBalances.find((row) => row.code === '5220')?.balance).toBe(7800);
  });
});
