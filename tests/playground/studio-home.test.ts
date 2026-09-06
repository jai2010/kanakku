import { EngineService } from '../../src/application/playground/EngineService';
import {
  activitySummaries,
  attentionQueue,
  classifyStudioIntent,
  conflictGroups,
  parseTeachInstruction,
  relativeWorkedLabel,
  searchStudioModel
} from '../../app/studio-model';
import { EngineSnapshot } from '../../app/engine-types';

function live(): EngineSnapshot {
  return EngineService.createLive().snapshot();
}

describe('Studio Home model', () => {
  const accounts = [
    { code: '6100', name: 'Software Expense' },
    { code: '5220', name: 'Business Meals' },
    { code: '6300', name: 'Travel Expense' },
    { code: '6200', name: 'Cloud Infrastructure' },
    { code: '2000', name: 'Corporate Card' }
  ];

  it('still extracts merchant and account from a should-go-to instruction', () => {
    expect(parseTeachInstruction('Spotify should go to Software Expense', accounts)).toEqual({
      merchant: 'Spotify',
      name: 'Spotify Software Expense',
      debitCode: '6100'
    });
  });

  it('extracts create, treat, and change instructions', () => {
    expect(parseTeachInstruction('Treat all Uber rides as Travel Expense paid by Corporate Card.', accounts)).toEqual({
      merchant: 'Uber',
      name: 'Uber Travel Expense',
      debitCode: '6300'
    });
    expect(parseTeachInstruction('Create a rule for Starbucks purchases over ₹1,000.', accounts)).toEqual({
      merchant: 'Starbucks',
      name: 'Starbucks rule'
    });
    expect(parseTeachInstruction('AWS infrastructure should go to Cloud Infrastructure instead of Software.', accounts)).toMatchObject({
      merchant: 'AWS',
      debitCode: '6200'
    });
  });

  it('does not treat a why-question as authoring', () => {
    expect(parseTeachInstruction('Why did this transaction get posted to Software Expense?', accounts)).toEqual({
      error: 'That is a question about the live model, not a new transformation.'
    });
  });

  it('classifies create, change, understand, search, and navigate', () => {
    const snapshot = live();
    expect(classifyStudioIntent('Treat all Uber rides as Travel Expense paid by Corporate Card.', snapshot).kind).toBe('teach');
    expect(classifyStudioIntent('AWS infrastructure should go to Cloud Infrastructure instead of Software.', snapshot).kind).toBe('teach');
    expect(classifyStudioIntent('Why did this transaction get posted to Software Expense?', snapshot)).toMatchObject({
      kind: 'explain',
      transformationId: 'R126'
    });
    expect(classifyStudioIntent('Show me everything that accounts for AWS', snapshot)).toEqual({
      kind: 'search',
      query: 'Show me everything that accounts for AWS'
    });
    expect(classifyStudioIntent('Explore purchases', snapshot)).toEqual({
      kind: 'navigate',
      pane: 'activities',
      activity: 'PURCHASE'
    });
    expect(classifyStudioIntent('How should AWS infrastructure usage be accounted?', snapshot).kind).toBe('search');
  });

  it('searches transformations, accounts, and credit-side usage without listing the whole model', () => {
    const snapshot = live();
    const aws = searchStudioModel(snapshot, 'Show me everything that accounts for AWS');
    expect(aws.some((hit) => hit.title.includes('AWS / Software'))).toBe(true);
    expect(aws.some((hit) => hit.title.includes('AWS Infrastructure'))).toBe(true);
    expect(aws.every((hit) => hit.kind !== 'transformation' || hit.title.toLowerCase().includes('aws'))).toBe(true);

    const card = searchStudioModel(snapshot, 'Where does Corporate Card get credited?');
    expect(card.some((hit) => hit.kind === 'account' && hit.title === 'Corporate Card')).toBe(true);
    expect(card.some((hit) => hit.kind === 'transformation' && hit.subtitle.startsWith('Credits'))).toBe(true);
    expect(card.length).toBeLessThanOrEqual(12);
  });

  it('uses activities as compact explore entry points', () => {
    const summaries = activitySummaries(live());
    expect(summaries.map((row) => row.type)).toEqual([
      'PURCHASE',
      'PAYMENT',
      'REFUND',
      'USAGE',
      'WALLET_LOAD',
      'WALLET_SPEND',
      'MARKETPLACE_SALE',
      'SELLER_PAYOUT'
    ]);
    const purchases = summaries.find((row) => row.type === 'PURCHASE');
    expect(purchases?.transformations).toBeGreaterThan(0);
    expect(purchases?.accounts).toBeGreaterThan(0);
  });

  it('keeps the attention queue grouped so more transformations do not add more rows', () => {
    const snapshot = live();
    expect(attentionQueue(snapshot)).toEqual([]);

    const purchases = snapshot.rules.filter((rule) => rule.activity === 'PURCHASE');
    const conflicting: EngineSnapshot = {
      ...snapshot,
      rules: snapshot.rules.map((rule) =>
        rule.displayId === purchases[0]?.displayId || rule.displayId === purchases[1]?.displayId
          ? { ...rule, priority: 100 }
          : rule
      )
    };
    const items = attentionQueue(conflicting);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toMatch(/overlapping purchases/i);
    expect(conflictGroups(conflicting.rules)[0]?.rules.length).toBeGreaterThanOrEqual(2);
  });

  it('labels recency for a workspace, not a dump of every transformation', () => {
    expect(relativeWorkedLabel(Date.now() - 2 * 60 * 60 * 1000, Date.now())).toBe('2 hours ago');
    expect(relativeWorkedLabel(Date.now() - 26 * 60 * 60 * 1000, Date.now())).toBe('Yesterday');
  });
});
