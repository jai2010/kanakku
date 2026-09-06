import { EngineService } from '../../src/application/playground/EngineService';
import {
  filterIndexTransformations,
  groupIndexTransformations,
  indexConflict,
  isFallbackTransformation,
  matchSummary,
  matchesTransformation
} from '../../app/studio-model';
import { EngineSnapshot } from '../../app/engine-types';

function live(): EngineSnapshot {
  return EngineService.createLive().snapshot();
}

describe('Transformations index model', () => {
  it('summarizes matching logic without opening the workspace', () => {
    const snapshot = live();
    const meals = snapshot.rules.find((rule) => rule.displayId === 'R110');
    const aws = snapshot.rules.find((rule) => rule.displayId === 'R126');
    const general = snapshot.rules.find((rule) => rule.name === 'General Purchase');
    expect(matchSummary(meals!)).toBe('Purchase · Starbucks · Amount > ₹1,000');
    expect(matchSummary(aws!)).toBe('Purchase · AWS');
    expect(matchSummary(general!)).toBe('Purchase · any');
  });

  it('marks the lowest activity-only rule as the fallback', () => {
    const snapshot = live();
    const general = snapshot.rules.find((rule) => rule.name === 'General Purchase');
    const meals = snapshot.rules.find((rule) => rule.displayId === 'R110');
    expect(isFallbackTransformation(general!, snapshot.rules)).toBe(true);
    expect(isFallbackTransformation(meals!, snapshot.rules)).toBe(false);
  });

  it('searches name, id, account, activity, and amount conditions', () => {
    const snapshot = live();
    const ids = (query: string) => snapshot.rules.filter((rule) => matchesTransformation(rule, query)).map((rule) => rule.displayId);
    expect(ids('R126')).toEqual(['R126']);
    expect(ids('AWS')).toEqual(expect.arrayContaining(['R126', 'R130']));
    expect(ids('Software Expense')).toEqual(expect.arrayContaining(['R126', 'R120']));
    expect(ids('Purchase > ₹1,000')).toEqual(expect.arrayContaining(['R110']));
    expect(ids('Starbucks')).toEqual(['R110']);
  });

  it('groups by activity and keeps higher priority first', () => {
    const groups = groupIndexTransformations(live().rules);
    expect(groups.map((group) => group.label)).toEqual([
      'Purchases',
      'Payments',
      'Refunds',
      'Usage',
      'Wallet loads',
      'Wallet purchases',
      'Marketplace sales',
      'Payouts'
    ]);
    expect(groups[0]?.rules.map((rule) => rule.priority)).toEqual([126, 120, 110, 100, 90]);
  });

  it('filters without flattening the model into vanity stats', () => {
    const snapshot = live();
    const purchases = filterIndexTransformations(snapshot, {
      query: '',
      activity: 'PURCHASE',
      status: 'ALL',
      account: 'ALL',
      conflictsOnly: false,
      usageOnly: false
    });
    expect(purchases.every((rule) => rule.activity === 'PURCHASE')).toBe(true);
    expect(purchases.length).toBe(5);

    const card = filterIndexTransformations(snapshot, {
      query: '',
      activity: 'ALL',
      status: 'ALL',
      account: '2000',
      conflictsOnly: false,
      usageOnly: false
    });
    expect(card.every((rule) => rule.lines.some((line) => line.accountCode === '2000'))).toBe(true);
  });

  it('reports only same-priority conflicts as overlaps', () => {
    const snapshot = live();
    const meals = snapshot.rules.find((rule) => rule.displayId === 'R110')!;
    expect(indexConflict(meals, snapshot.rules).tone).toBe('ok');

    const colliding = snapshot.rules.map((rule) =>
      rule.displayId === 'R110' || rule.displayId === 'R126'
        ? { ...rule, priority: 110 }
        : rule
    );
    const conflict = indexConflict(colliding.find((rule) => rule.displayId === 'R110')!, colliding);
    expect(conflict.tone).toBe('warn');
    expect(conflict.label).toMatch(/overlaps 1 transformation/);
    expect(conflict.peers.map((rule) => rule.displayId)).toEqual(['R126']);
  });
});
