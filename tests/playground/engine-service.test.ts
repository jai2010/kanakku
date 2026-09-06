import { EngineService } from '../../src/application/playground/EngineService';

describe('EngineService', () => {
  it('posts a balanced Starbucks meals journal from the live policy pack', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Starbucks',
      amount: 7800,
      type: 'PURCHASE',
      category: 'Coffee chain',
      remember: false
    });
    const result = snapshot.lastResult;
    expect(result?.evaluation.matched).toBe(true);
    expect(result?.evaluation.selectedRule?.displayId).toBe('R110');
    expect(result?.journal?.posted).toBe(true);
    expect(result?.journal?.balanced).toBe(true);
    expect(result?.journal?.totalDebits).toBe(7800);
    expect(result?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5220', debit: 7800, credit: 0 }),
      expect.objectContaining({ accountCode: '2000', debit: 0, credit: 7800 })
    ]));
  });

  it('selects Amazon software over the general purchase catch-all', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Amazon',
      amount: 8000,
      type: 'PURCHASE',
      remember: false
    });
    expect(snapshot.lastResult?.evaluation.selectedRule?.displayId).toBe('R120');
    expect(snapshot.lastResult?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6100', debit: 8000 }),
      expect.objectContaining({ accountCode: '2100', credit: 8000 })
    ]));
  });

  it('uses the general purchase rule for an unknown merchant', async () => {
    const engine = EngineService.createLive();
    const snapshot = await engine.process({
      merchant: 'Spotify',
      amount: 199,
      type: 'PURCHASE',
      remember: false
    });
    expect(snapshot.lastResult?.evaluation.selectedRule?.displayId).toBe('R090');
    expect(snapshot.lastResult?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5000', debit: 199 }),
      expect.objectContaining({ accountCode: '1010', credit: 199 })
    ]));
  });

  it('posts refunds and bank fees through dedicated rules', async () => {
    const engine = EngineService.createLive();
    const refund = await engine.process({ merchant: 'Customer Refund', amount: 5000, type: 'REFUND', remember: false });
    expect(refund.lastResult?.evaluation.selectedRule?.displayId).toBe('R080');
    const fee = await engine.process({ merchant: 'Bank Fee', amount: 590, type: 'PAYMENT', remember: false });
    expect(fee.lastResult?.evaluation.selectedRule?.displayId).toBe('R070');
  });

  it('lets a newly added rule win on the next run', async () => {
    const engine = EngineService.createLive();
    engine.addRule({
      merchant: 'Spotify',
      name: 'Spotify Subscriptions',
      debitCode: '6100',
      creditCode: '2000'
    });
    const snapshot = await engine.process({
      merchant: 'Spotify',
      amount: 199,
      type: 'PURCHASE',
      remember: false
    });
    expect(snapshot.lastResult?.evaluation.selectedRule?.name).toBe('Spotify Subscriptions');
    expect(snapshot.lastResult?.journal?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '6100', debit: 199 }),
      expect.objectContaining({ accountCode: '2000', credit: 199 })
    ]));
  });

  it('adds a chart-of-accounts entry without posting', () => {
    const engine = EngineService.createLive();
    const before = engine.snapshot().accountBalances.length;
    const snapshot = engine.addAccount({
      name: 'Delivery Meals',
      code: '5230',
      type: 'EXPENSE'
    });
    expect(snapshot.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: '5230', name: 'Delivery Meals', type: 'EXPENSE' })
    ]));
    expect(snapshot.accountBalances).toHaveLength(before + 1);
    expect(snapshot.ledger).toHaveLength(0);
  });

  it('falls through after a higher-priority rule is disabled', async () => {
    const engine = EngineService.createLive();
    engine.toggleRule('R110');
    const snapshot = await engine.process({
      merchant: 'Starbucks',
      amount: 7800,
      type: 'PURCHASE',
      remember: false
    });
    expect(snapshot.lastResult?.evaluation.selectedRule?.displayId).toBe('R090');
  });
});
