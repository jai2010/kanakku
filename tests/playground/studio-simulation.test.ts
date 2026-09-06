import { EngineService } from '../../src/application/playground/EngineService';
import { parseTeachInstruction } from '../../app/studio-model';

describe('Accounting Studio kernel surface', () => {
  it('presents each transformation as N journal lines, not a debit/credit pair', () => {
    const snapshot = EngineService.createLive().snapshot();
    const meals = snapshot.rules.find((rule) => rule.displayId === 'R110');
    expect(meals?.name).toBe('Starbucks Meals');
    expect(meals?.activity).toBe('PURCHASE');
    expect(meals?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        side: 'DEBIT',
        accountCode: '5220',
        accountName: 'Business Meals',
        amountType: 'EVENT_AMOUNT',
        amountLabel: 'Transaction amount'
      }),
      expect.objectContaining({
        side: 'CREDIT',
        accountCode: '2000',
        accountName: 'Corporate Card',
        amountType: 'EVENT_AMOUNT'
      })
    ]));
    expect(snapshot.policy?.status).toBe('ACTIVE');
    expect(snapshot.policy?.dsl).toContain('RULE "Starbucks Meals"');
  });

  it('simulates a transformation without posting a journal', async () => {
    const engine = EngineService.createLive();
    const before = engine.snapshot();
    const snapshot = await engine.simulate({ ruleId: 'R110' });
    const sim = snapshot.lastSimulation;
    expect(sim?.intendedRuleDisplayId).toBe('R110');
    expect(sim?.source).toBe('conditions');
    expect(sim?.matched).toBe(true);
    expect(sim?.selectedRuleDisplayId).toBe('R110');
    expect(sim?.wouldPost).toBe(true);
    expect(sim?.balanced).toBe(true);
    expect(sim?.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: '5220', debit: sim?.amount }),
      expect.objectContaining({ accountCode: '2000', credit: sim?.amount })
    ]));
    expect(snapshot.ledger).toHaveLength(before.ledger.length);
    expect(snapshot.transactions).toHaveLength(before.transactions.length);
    expect(snapshot.lastResult).toBeNull();
    expect(snapshot.metrics.posted).toBe(0);
  });

  it('adds a condition to an existing transformation and recompiles the live policy', () => {
    const engine = EngineService.createLive();
    const snapshot = engine.addCondition({
      ruleId: 'R110',
      field: 'counterparty',
      op: '!=',
      value: 'Uber Eats'
    });
    const meals = snapshot.rules.find((rule) => rule.displayId === 'R110');
    expect(meals?.conditionDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'counterparty', op: '!=', value: 'Uber Eats' })
    ]));
    expect(snapshot.policy?.dsl).toContain('counterparty != "Uber Eats"');
  });

  it('simulates a real posted transaction without double-posting', async () => {
    const engine = EngineService.createLive();
    const posted = await engine.process({
      merchant: 'Starbucks',
      amount: 7800,
      type: 'PURCHASE',
      remember: false
    });
    const eventId = posted.lastResult?.eventId;
    expect(eventId).toBeDefined();
    const snapshot = await engine.simulate({ ruleId: 'R110', eventId });
    expect(snapshot.lastSimulation).toMatchObject({
      source: 'transaction',
      eventId,
      amount: 7800,
      selectedRuleDisplayId: 'R110',
      wouldPost: true
    });
    expect(snapshot.ledger).toHaveLength(1);
    expect(snapshot.metrics.posted).toBe(1);
  });
});

describe('Teach SUTRA instruction parsing', () => {
  const accounts = [
    { code: '6100', name: 'Software Expense' },
    { code: '5220', name: 'Business Meals' }
  ];

  it('extracts merchant and account from a natural-language instruction', () => {
    expect(parseTeachInstruction('Spotify should go to Software Expense', accounts)).toEqual({
      merchant: 'Spotify',
      name: 'Spotify Software Expense',
      debitCode: '6100'
    });
  });

  it('rejects an instruction that does not name a counterparty', () => {
    expect(parseTeachInstruction('make it software', accounts)).toEqual({
      error: 'Name the merchant or counterparty, for example “Spotify should go to Software Expense.”'
    });
  });
});
