import { PlaygroundService } from '../../src/application/playground/PlaygroundService';
import { DEFAULT_INSTRUCTION, DEMO_MEALS_DSL } from '../../src/application/playground/demoData';
import { inspectAuthoringIntent } from '../../src/application/playground/inspectAuthoringIntent';

describe('PlaygroundService', () => {
  it('does not activate after AI generation', async () => {
    const playground = PlaygroundService.createDemo();
    const snapshot = await playground.author(DEFAULT_INSTRUCTION);
    expect(snapshot.authoringStatus).toBe('COMPILED');
    expect(snapshot.policyStatus).toBe('AI_GENERATED');
    expect(snapshot.allowedActions).toContain('validate');
    expect(snapshot.allowedActions).not.toContain('activate');
    expect(snapshot.allowedActions).not.toContain('process');
    expect(snapshot.ledger).toBeNull();
  });

  it('rejects invalid DSL and does not allow validation to proceed', () => {
    const playground = PlaygroundService.createDemo();
    const snapshot = playground.replaceDsl('this is not a policy');
    expect(snapshot.authoringStatus).toBe('REJECTED');
    expect(snapshot.policyStatus).toBeNull();
    expect(snapshot.allowedActions).not.toContain('validate');
    expect(snapshot.allowedActions).not.toContain('simulate');
  });

  it('invalidates simulation after DSL edits', async () => {
    const playground = PlaygroundService.createDemo();
    await playground.author(DEFAULT_INSTRUCTION);
    await playground.validate();
    await playground.simulate();
    expect(playground.snapshot().simulation).not.toBeNull();
    expect(playground.snapshot().policyStatus).toBe('SIMULATED');

    const edited = playground.replaceDsl(DEMO_MEALS_DSL.replace('PRIORITY 100', 'PRIORITY 50'));
    expect(edited.simulation).toBeNull();
    expect(edited.validation).toBeNull();
    expect(edited.ledger).toBeNull();
    expect(edited.policyStatus).toBe('DRAFT');
    expect(edited.allowedActions).toContain('validate');
    expect(edited.allowedActions).not.toContain('approve');
  });

  it('simulation does not post journals', async () => {
    const playground = PlaygroundService.createDemo();
    await playground.author(DEFAULT_INSTRUCTION);
    await playground.validate();
    const snapshot = await playground.simulate();
    expect(snapshot.simulation?.didPost).toBe(false);
    expect(snapshot.ledger).toBeNull();
    expect(snapshot.simulation?.events.some((event) => event.matched && event.wouldPost)).toBe(true);
    expect(snapshot.simulation?.events.some((event) => !event.matched)).toBe(true);
  });

  it('cannot approve before simulation or activate before approval', async () => {
    const playground = PlaygroundService.createDemo();
    await playground.author(DEFAULT_INSTRUCTION);
    await playground.validate();
    expect(playground.snapshot().allowedActions).not.toContain('approve');
    const beforeSimulation = await playground.approve();
    expect(beforeSimulation.policyStatus).toBe('VALIDATED');
    expect(beforeSimulation.error).toMatch(/Invalid policy lifecycle transition/);

    await playground.simulate();
    expect(playground.snapshot().allowedActions).toContain('approve');
    expect(playground.snapshot().allowedActions).not.toContain('activate');
    const beforeApproval = await playground.activate();
    expect(beforeApproval.policyStatus).toBe('SIMULATED');
    expect(beforeApproval.error).toMatch(/Invalid policy lifecycle transition/);
  });

  it('only an ACTIVE policy can process events, and the posted journal is balanced', async () => {
    const playground = PlaygroundService.createDemo();
    await playground.author(DEFAULT_INSTRUCTION);
    expect((await playground.processEvents()).ledger).toBeNull();

    await playground.validate();
    await playground.simulate();
    await playground.approve();
    await playground.activate();
    const snapshot = await playground.processEvents();
    expect(snapshot.policyStatus).toBe('ACTIVE');
    const posted = snapshot.ledger?.entries.filter((entry) => entry.posted) ?? [];
    expect(posted.length).toBe(1);
    expect(posted[0]?.balanced).toBe(true);
    expect(posted[0]?.totalDebits).toBe(7800);
    expect(posted[0]?.totalCredits).toBe(7800);
    expect(snapshot.ledger?.entries.filter((entry) => !entry.posted)).toHaveLength(2);
  });

  it('uses fake mode without network and surfaces clarification/unsupported without inventing DSL', async () => {
    const playground = PlaygroundService.createDemo();
    expect(playground.snapshot().provider).toBe('fake');

    const unclear = await playground.author('Large Starbucks purchases should be treated as meals.');
    expect(unclear.authoringStatus).toBe('NEEDS_CLARIFICATION');
    expect(unclear.dsl).toBe('');
    expect(unclear.clarificationNeeds.length).toBeGreaterThan(0);

    const unsupported = await playground.author('Book GST on this purchase and email the receipt.');
    expect(unsupported.authoringStatus).toBe('UNSUPPORTED');
    expect(unsupported.dsl).toBe('');
    expect(unsupported.unsupportedReason).toContain('not');
  });
});

describe('inspectAuthoringIntent', () => {
  it('asks for missing amount and accounts instead of inventing them', () => {
    const intent = inspectAuthoringIntent('Large Starbucks purchases should be treated as meals.');
    expect(intent.kind).toBe('NEEDS_CLARIFICATION');
    if (intent.kind !== 'NEEDS_CLARIFICATION') {
      throw new Error('expected clarification');
    }
    expect(intent.needs.some((need) => need.toLowerCase().includes('amount'))).toBe(true);
    expect(intent.needs.some((need) => need.toLowerCase().includes('debit'))).toBe(true);
    expect(intent.needs.some((need) => need.toLowerCase().includes('credit'))).toBe(true);
  });

  it('accepts the demo instruction as clear', () => {
    expect(inspectAuthoringIntent(DEFAULT_INSTRUCTION).kind).toBe('CLEAR');
  });
});
