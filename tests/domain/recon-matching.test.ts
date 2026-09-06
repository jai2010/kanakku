import { matchTransactions } from '../../src/domain/recon/match';
import {
  filterReconItems,
  resolveReconItem,
  summarizeRecon,
  ReconParty
} from '../../src/domain/recon/Reconciliation';

function party(partial: Partial<ReconParty> & Pick<ReconParty, 'id' | 'counterparty' | 'amount'>): ReconParty {
  return {
    reference: partial.reference ?? null,
    description: partial.description ?? partial.counterparty,
    currency: 'INR',
    date: partial.date ?? '2026-09-06',
    type: partial.type ?? 'PURCHASE',
    sequence: partial.sequence ?? 1,
    lines: partial.lines ?? [],
    ...partial
  };
}

describe('Recon matching', () => {
  it('pairs by shared reference even when amounts differ', () => {
    const items = matchTransactions(
      [party({ id: 'ext-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1240 })],
      [party({ id: 'knk-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1200 })]
    );
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('DIFFERENCE');
    expect(items[0].difference).toBe(40);
  });

  it('pairs by date, type, and counterparty when reference is missing', () => {
    const items = matchTransactions(
      [party({ id: 'ext-amazon', counterparty: 'Amazon', amount: 8000 })],
      [party({ id: 'knk-amazon', counterparty: 'amazon', amount: 8000 })]
    );
    expect(items[0].status).toBe('MATCHED');
    expect(items[0].difference).toBe(0);
  });

  it('prefers an exact amount among counterparties with the same identity', () => {
    const items = matchTransactions(
      [party({ id: 'ext-aws', counterparty: 'AWS', amount: 480, type: 'USAGE' })],
      [
        party({ id: 'knk-aws-big', counterparty: 'AWS', amount: 82400, type: 'USAGE' }),
        party({ id: 'knk-aws', counterparty: 'AWS', amount: 480, type: 'USAGE' })
      ]
    );
    expect(items.find((item) => item.status === 'MATCHED')?.kanakku?.id).toBe('knk-aws');
    expect(items.find((item) => item.status === 'MISSING_EXTERNALLY')?.kanakku?.id).toBe('knk-aws-big');
  });

  it('marks an unpaired external as missing in Kanakku', () => {
    const items = matchTransactions(
      [party({ id: 'ext-saas', counterparty: 'Unknown SaaS', amount: 240, type: 'USAGE' })],
      []
    );
    expect(items[0]).toMatchObject({ status: 'MISSING_IN_KANAKKU', kanakku: null });
  });

  it('marks an unpaired Kanakku transaction as missing externally', () => {
    const items = matchTransactions(
      [],
      [party({ id: 'knk-slack', counterparty: 'Slack', amount: 2400 })]
    );
    expect(items[0]).toMatchObject({ status: 'MISSING_EXTERNALLY', external: null });
  });

  it('does not use amount as the pairing key', () => {
    const items = matchTransactions(
      [party({ id: 'ext-a', counterparty: 'Uber', amount: 1240 })],
      [party({ id: 'knk-b', counterparty: 'Priya', amount: 1240 })]
    );
    expect(items.map((item) => item.status).sort()).toEqual(['MISSING_EXTERNALLY', 'MISSING_IN_KANAKKU']);
  });
});

describe('Recon resolution and filters', () => {
  it('records a reason and moves an exception to resolved', () => {
    const item = matchTransactions(
      [party({ id: 'ext-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1240 })],
      [party({ id: 'knk-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1200 })]
    )[0];
    const resolved = resolveReconItem(item, '₹40 service charge.', '2026-09-06T12:00:00.000Z');
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionReason).toBe('₹40 service charge.');
    expect(filterReconItems([resolved], 'resolved')).toHaveLength(1);
    expect(filterReconItems([resolved], 'differences')).toHaveLength(0);
  });

  it('ignores a blank resolution', () => {
    const item = matchTransactions(
      [party({ id: 'ext-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1240 })],
      [party({ id: 'knk-uber', reference: 'CC-1', counterparty: 'Uber', amount: 1200 })]
    )[0];
    expect(resolveReconItem(item, '   ', '2026-09-06T12:00:00.000Z').status).toBe('DIFFERENCE');
  });

  it('summarizes matched, difference, missing, and resolved counts', () => {
    const items = [
      { id: '1', external: party({ id: 'a', counterparty: 'A', amount: 100 }), kanakku: party({ id: 'b', counterparty: 'A', amount: 100 }), status: 'MATCHED' as const, difference: 0, resolutionReason: null, resolvedAt: null },
      { id: '2', external: party({ id: 'c', counterparty: 'B', amount: 50 }), kanakku: party({ id: 'd', counterparty: 'B', amount: 40 }), status: 'DIFFERENCE' as const, difference: 10, resolutionReason: null, resolvedAt: null },
      { id: '3', external: party({ id: 'e', counterparty: 'C', amount: 20 }), kanakku: null, status: 'MISSING_IN_KANAKKU' as const, difference: null, resolutionReason: null, resolvedAt: null },
      { id: '4', external: null, kanakku: party({ id: 'f', counterparty: 'D', amount: 15 }), status: 'MISSING_EXTERNALLY' as const, difference: null, resolutionReason: null, resolvedAt: null },
      { id: '5', external: party({ id: 'g', counterparty: 'E', amount: 30 }), kanakku: party({ id: 'h', counterparty: 'E', amount: 25 }), status: 'RESOLVED' as const, difference: 5, resolutionReason: 'fee', resolvedAt: '2026-09-06T00:00:00.000Z' }
    ];
    expect(summarizeRecon(items)).toEqual({
      itemCount: 5,
      externalTotal: 200,
      matched: 1,
      differences: 1,
      missing: 2,
      missingInKanakku: 1,
      missingExternally: 1,
      resolved: 1
    });
  });
});
