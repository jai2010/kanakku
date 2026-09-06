import { itemSequence, ReconciliationItem, ReconParty } from './Reconciliation';

export function normalizeCounterparty(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pairStatus(external: ReconParty, kanakku: ReconParty): Pick<ReconciliationItem, 'status' | 'difference'> {
  const difference = external.amount - kanakku.amount;
  if (difference === 0) {
    return { status: 'MATCHED', difference: 0 };
  }
  return { status: 'DIFFERENCE', difference };
}

function pairedItem(external: ReconParty, kanakku: ReconParty): ReconciliationItem {
  const result = pairStatus(external, kanakku);
  return {
    id: `item-${external.id}`,
    external,
    kanakku,
    status: result.status,
    difference: result.difference,
    resolutionReason: null,
    resolvedAt: null
  };
}

function sameIdentity(external: ReconParty, kanakku: ReconParty): boolean {
  if (external.reference !== null && kanakku.reference !== null && external.reference === kanakku.reference) {
    return true;
  }
  return external.date === kanakku.date
    && external.type === kanakku.type
    && normalizeCounterparty(external.counterparty) === normalizeCounterparty(kanakku.counterparty);
}

function pickMatch(external: ReconParty, unmatched: ReconParty[]): ReconParty | undefined {
  const candidates = unmatched.filter((kanakku) => sameIdentity(external, kanakku));
  if (candidates.length === 0) {
    return undefined;
  }
  const exact = candidates.find((kanakku) => kanakku.amount === external.amount);
  return exact ?? candidates[0];
}

export function matchTransactions(
  externals: readonly ReconParty[],
  kanakkuTransactions: readonly ReconParty[]
): ReconciliationItem[] {
  const unmatched = [...kanakkuTransactions];
  const items: ReconciliationItem[] = [];

  for (const external of externals) {
    const hit = pickMatch(external, unmatched);
    if (hit === undefined) {
      items.push({
        id: `item-${external.id}`,
        external,
        kanakku: null,
        status: 'MISSING_IN_KANAKKU',
        difference: null,
        resolutionReason: null,
        resolvedAt: null
      });
      continue;
    }
    const index = unmatched.findIndex((row) => row.id === hit.id);
    unmatched.splice(index, 1);
    items.push(pairedItem(external, hit));
  }

  for (const kanakku of unmatched) {
    items.push({
      id: `item-${kanakku.id}`,
      external: null,
      kanakku,
      status: 'MISSING_EXTERNALLY',
      difference: null,
      resolutionReason: null,
      resolvedAt: null
    });
  }

  return items.sort((left, right) => itemSequence(left) - itemSequence(right));
}
