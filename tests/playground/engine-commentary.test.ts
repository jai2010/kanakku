import { commentaryFor, COMPLETED_LINES, IDLE_LINES } from '../../app/engine-commentary';
import { groupDemoExamples, policyBookName } from '../../app/engine-demo-groups';
import { EngineExampleView, EngineProcessResult } from '../../app/engine-types';

function example(partial: Partial<EngineExampleView> & Pick<EngineExampleView, 'key' | 'merchant' | 'type'>): EngineExampleView {
  return {
    amount: 1000,
    category: partial.merchant,
    mark: 'x',
    tint: '#000',
    ...partial
  };
}

function result(partial: Partial<EngineProcessResult> & Pick<EngineProcessResult, 'merchant' | 'type'>): EngineProcessResult {
  return {
    eventId: 'e1',
    amount: 10000,
    category: partial.merchant,
    mark: 'x',
    tint: '#000',
    evaluation: { matched: true, reason: 'ok', selectedRule: null, rulesScanned: 1 },
    journal: null,
    stages: [],
    log: [],
    error: null,
    balanceImpact: [],
    transactional: null,
    ...partial
  };
}

describe('engine demo groups', () => {
  it('groups canned examples and keeps custom transactions out of Try a demo', () => {
    const groups = groupDemoExamples([
      example({ key: 'starbucks', merchant: 'Starbucks', type: 'PURCHASE', amount: 7800 }),
      example({ key: 'amazon', merchant: 'Amazon', type: 'PURCHASE', amount: 8000 }),
      example({ key: 'priya-load', merchant: 'Priya', type: 'WALLET_LOAD', amount: 10000 }),
      example({ key: 'priya-spend', merchant: 'Priya', type: 'WALLET_SPEND', amount: 2500 }),
      example({ key: 'acme-sale', merchant: 'Acme Electronics', type: 'MARKETPLACE_SALE', amount: 10000 }),
      example({ key: 'aws-ec2', merchant: 'AWS', type: 'USAGE', amount: 480 }),
      example({ key: 'refund', merchant: 'Customer Refund', type: 'REFUND', amount: 5000 }),
      example({ key: 'custom-1', merchant: 'Spotify', type: 'PURCHASE', amount: 199 })
    ]);

    expect(groups.map((group) => group.id)).toEqual(['purchases', 'wallet', 'marketplace', 'usage', 'refunds']);
    expect(groups.find((group) => group.id === 'purchases')?.examples.map((row) => row.key)).toEqual(['starbucks', 'amazon']);
    expect(groups.find((group) => group.id === 'wallet')?.examples.map((row) => row.key)).toEqual(['priya-load', 'priya-spend']);
    expect(groups.some((group) => group.examples.some((row) => row.key === 'custom-1'))).toBe(false);
  });

  it('puts Priya purchase with wallet, not purchases', () => {
    const groups = groupDemoExamples([
      example({ key: 'priya-spend', merchant: 'Priya', type: 'WALLET_SPEND', amount: 2500 }),
      example({ key: 'starbucks', merchant: 'Starbucks', type: 'PURCHASE', amount: 7800 })
    ]);
    expect(groups.find((group) => group.id === 'wallet')?.examples[0]?.key).toBe('priya-spend');
    expect(groups.find((group) => group.id === 'purchases')?.examples[0]?.key).toBe('starbucks');
  });

  it('names the resolved policy book from the activity', () => {
    expect(policyBookName('MARKETPLACE_SALE')).toBe('Marketplace Accounting');
    expect(policyBookName('WALLET_LOAD')).toBe('Wallet Accounting');
    expect(policyBookName('PURCHASE')).toBe('Expense Accounting');
  });
});

describe('SUTRA commentary', () => {
  it('fills the silence when the queue is empty', () => {
    const line = commentaryFor({
      queueCount: 0,
      processing: false,
      activeIndex: -1,
      result: null,
      idleTick: 1
    });
    expect(line.mood).toBe('waiting');
    expect(IDLE_LINES).toContain(line.line);
  });

  it('reacts to a marketplace sale as it arrives', () => {
    const line = commentaryFor({
      queueCount: 1,
      processing: true,
      activeIndex: -1,
      result: result({ merchant: 'Acme Electronics', type: 'MARKETPLACE_SALE' }),
      idleTick: 0
    });
    expect(line.mood).toBe('arrives');
    expect(line.line).toMatch(/Marketplace sale/i);
  });

  it('refuses to invent a rule for unknown SaaS', () => {
    const line = commentaryFor({
      queueCount: 1,
      processing: true,
      activeIndex: 1,
      result: result({
        merchant: 'Unknown SaaS',
        type: 'USAGE',
        evaluation: { matched: false, reason: 'none', selectedRule: null, rulesScanned: 8 }
      }),
      idleTick: 0
    });
    expect(line.mood).toBe('unmatched');
    expect(line.line).toMatch(/not guessing/i);
  });

  it('keeps the last posted transaction in commentary when the queue is empty', () => {
    const line = commentaryFor({
      queueCount: 0,
      processing: false,
      activeIndex: 5,
      result: result({
        merchant: 'Acme Electronics',
        type: 'MARKETPLACE_SALE',
        journal: {
          id: 'j1',
          displayId: 'JN-2026-000013',
          lines: [],
          totalDebits: 10000,
          totalCredits: 10000,
          balanced: true,
          posted: true,
          kernelMs: 4
        }
      }),
      idleTick: 0
    });
    expect(line.mood).toBe('waiting');
    expect(COMPLETED_LINES).toContain(line.line);
  });

  it('is dismissive after a successful post', () => {
    const line = commentaryFor({
      queueCount: 1,
      processing: true,
      activeIndex: 5,
      result: result({
        merchant: 'Acme Electronics',
        type: 'MARKETPLACE_SALE',
        journal: {
          id: 'j1',
          displayId: 'JN-2026-000013',
          lines: [],
          totalDebits: 10000,
          totalCredits: 10000,
          balanced: true,
          posted: true,
          kernelMs: 4
        }
      }),
      idleTick: 0
    });
    expect(line.mood).toBe('posting');
    expect(line.line).toBe('Posted. Next.');
  });
});
