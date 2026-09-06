import { EngineService } from '../../src/application/playground/EngineService';
import { DEMO_EXTERNAL_TOTAL, createDemoReconRun } from '../../src/application/recon/demoRecon';
import { ReconService } from '../../src/application/recon/ReconService';
import {
  formatReconDate,
  liveTransactionFor,
  reconCommentary,
  statusLabel
} from '../../app/recon-model';

describe('Demo recon run', () => {
  const run = createDemoReconRun();
  const summary = ReconService.summary(run);

  it('is a deterministic corporate card statement for 6 September', () => {
    expect(run.id).toBe('run-cc-2026-09-06');
    expect(run.sourceLabel).toBe('CORPORATE CARD');
    expect(run.date).toBe('2026-09-06');
    expect(formatReconDate(run.date)).toBe('SEPTEMBER 6');
    expect(createDemoReconRun()).toEqual(run);
  });

  it('uses a fixed 42-item statement totaling ₹384,200', () => {
    expect(summary.itemCount).toBe(42);
    expect(summary.externalTotal).toBe(DEMO_EXTERNAL_TOTAL);
    expect(summary.externalTotal).toBe(384200);
    expect(summary.matched).toBe(38);
    expect(summary.differences).toBe(1);
    expect(summary.missing).toBe(2);
    expect(summary.missingInKanakku).toBe(1);
    expect(summary.missingExternally).toBe(1);
    expect(summary.resolved).toBe(1);
  });

  it('demonstrates match, amount difference, both missing states, and a resolved exception', () => {
    const byMerchant = (name: string) => run.items.find((item) =>
      item.external?.counterparty === name || item.kanakku?.counterparty === name
    );
    expect(byMerchant('Amazon')).toMatchObject({ status: 'MATCHED', difference: 0 });
    expect(byMerchant('Starbucks')?.status).toBe('MATCHED');
    expect(byMerchant('AWS')).toMatchObject({ status: 'MATCHED' });
    expect(byMerchant('Uber')).toMatchObject({ status: 'DIFFERENCE', difference: 40 });
    expect(byMerchant('Unknown SaaS')).toMatchObject({ status: 'MISSING_IN_KANAKKU', kanakku: null });
    expect(byMerchant('Slack')).toMatchObject({ status: 'MISSING_EXTERNALLY', external: null });
    expect(byMerchant('Microsoft')).toMatchObject({
      status: 'RESOLVED',
      difference: 500,
      resolutionReason: 'Marketplace fee was included in the external amount.'
    });
  });

  it('filters matched, differences, missing, and resolved without changing the run', () => {
    expect(ReconService.filter(run, 'all')).toHaveLength(42);
    expect(ReconService.filter(run, 'matched')).toHaveLength(38);
    expect(ReconService.filter(run, 'differences').map((item) => item.external?.counterparty)).toEqual(['Uber']);
    expect(ReconService.filter(run, 'missing').map((item) => item.external?.counterparty ?? item.kanakku?.counterparty)).toEqual(['Unknown SaaS', 'Slack']);
    expect(ReconService.filter(run, 'resolved').map((item) => item.external?.counterparty)).toEqual(['Microsoft']);
    expect(ReconService.summary(run).itemCount).toBe(42);
  });

  it('resolves the Uber difference with a visible reason', () => {
    const uber = run.items.find((item) => item.external?.counterparty === 'Uber');
    expect(uber).toBeDefined();
    const next = ReconService.resolve(run, uber!.id, '₹40 service charge.', '2026-09-06T12:00:00.000Z');
    const resolved = next.items.find((item) => item.id === uber!.id);
    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolutionReason).toBe('₹40 service charge.');
    expect(ReconService.summary(next)).toMatchObject({ differences: 0, resolved: 2 });
    expect(run.items.find((item) => item.id === uber!.id)?.status).toBe('DIFFERENCE');
  });

  it('keeps Kanakku commentary short and operational', () => {
    const uber = run.items.find((item) => item.external?.counterparty === 'Uber')!;
    const missing = run.items.find((item) => item.status === 'MISSING_IN_KANAKKU')!;
    const missingExternal = run.items.find((item) => item.status === 'MISSING_EXTERNALLY')!;
    const matched = run.items.find((item) => item.status === 'MATCHED')!;
    const resolved = run.items.find((item) => item.status === 'RESOLVED')!;
    expect(reconCommentary(matched)).toBe("These two agree. I'm not touching them.");
    expect(reconCommentary(uber)).toBe("That's ₹40 more than what I recorded. Someone explain that.");
    expect(reconCommentary(missing)).toBe("I see the transaction. I don't see the accounting.");
    expect(reconCommentary(missingExternal)).toBe('I recorded it. Apparently nobody told the other side.');
    expect(reconCommentary(resolved)).toBe("Fine. Now we're even.");
    expect(statusLabel('MISSING_IN_KANAKKU')).toBe('MISSING IN KANAKKU');
  });

  it('does not use SUTRA in recon labels', () => {
    const blob = JSON.stringify(run);
    expect(blob.includes('SUTRA')).toBe(false);
    expect(blob.includes('Sutra')).toBe(false);
  });

  it('links Amazon and Starbucks back to seeded Kanakku transactions', async () => {
    const snapshot = await EngineService.createLive().seedDemo();
    const amazon = run.items.find((item) => item.external?.counterparty === 'Amazon')!;
    const starbucks = run.items.find((item) => item.external?.counterparty === 'Starbucks')!;
    const saas = run.items.find((item) => item.external?.counterparty === 'Unknown SaaS')!;
    expect(liveTransactionFor(snapshot, amazon)?.counterparty).toBe('Amazon');
    expect(liveTransactionFor(snapshot, amazon)?.amount).toBe(8000);
    expect(liveTransactionFor(snapshot, amazon)?.journalId).toEqual(expect.any(String));
    expect(liveTransactionFor(snapshot, starbucks)?.counterparty).toBe('Starbucks');
    expect(liveTransactionFor(snapshot, saas)).toBeUndefined();
  });

  it('does not change seeded accounting when the recon run is created', async () => {
    const engine = EngineService.createLive();
    const before = await engine.seedDemo();
    createDemoReconRun();
    const after = engine.snapshot();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.ledger).toEqual(before.ledger);
    expect(after.metrics.posted).toBe(before.metrics.posted);
  });
});
