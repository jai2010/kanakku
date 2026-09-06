import { EngineService } from '../../src/application/playground/EngineService';
import { proposeAccounting, proposalReady, suggestAccountCode } from '../../app/studio-model';

describe('Accounting proposal', () => {
  const accounts = EngineService.createLive().snapshot().accounts;

  it('turns the canonical demo sentence into editable accounting, without creating a rule', () => {
    const proposal = proposeAccounting('Mark all Starbucks expenses > ₹5,000 as Business Meals', accounts);
    expect('error' in proposal).toBe(false);
    if ('error' in proposal) {
      return;
    }
    expect(proposal.activity).toBe('PURCHASE');
    expect(proposal.conditions).toEqual(expect.arrayContaining([
      { field: 'eventType', op: '=', value: 'PURCHASE' },
      { field: 'counterparty', op: '=', value: 'Starbucks' },
      { field: 'amount', op: '>', value: 5000 }
    ]));
    expect(proposal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ side: 'DEBIT', accountCode: '5220', accountName: 'Business Meals', exists: true }),
      expect.objectContaining({ side: 'CREDIT', accountCode: '2000', accountName: 'Corporate Card', exists: true })
    ]));
    expect(proposalReady(proposal)).toBe(true);
  });

  it('does not invent a missing account', () => {
    const proposal = proposeAccounting('Mark all Swiggy expenses as Delivery Meals', accounts);
    expect('error' in proposal).toBe(false);
    if ('error' in proposal) {
      return;
    }
    const debit = proposal.lines.find((line) => line.side === 'DEBIT');
    expect(debit).toMatchObject({ accountName: 'Delivery Meals', exists: false, accountCode: null, suggestedType: 'EXPENSE' });
    expect(proposalReady(proposal)).toBe(false);
    expect(suggestAccountCode('EXPENSE', accounts.map((row) => row.code))).toMatch(/^\d{4}$/);
  });

  it('reads treat, goes-to, and charged-to sentences', () => {
    const uber = proposeAccounting('Treat Uber rides as Travel', accounts);
    const aws = proposeAccounting('AWS infrastructure goes to Cloud Infrastructure', accounts);
    const bank = proposeAccounting('Bank fees should be charged to Bank Charges', accounts);
    expect(uber).toMatchObject({ activity: 'PURCHASE' });
    if (!('error' in uber)) {
      expect(uber.lines[0]).toMatchObject({ accountCode: '6300' });
      expect(uber.conditions).toEqual(expect.arrayContaining([{ field: 'counterparty', op: '=', value: 'Uber' }]));
    }
    expect(aws).toMatchObject({ activity: 'USAGE' });
    if (!('error' in aws)) {
      expect(aws.lines[0]).toMatchObject({ accountCode: '6200' });
    }
    expect(bank).toMatchObject({ activity: 'PAYMENT' });
    if (!('error' in bank)) {
      expect(bank.lines[0]).toMatchObject({ accountCode: '6500' });
    }
  });
});
