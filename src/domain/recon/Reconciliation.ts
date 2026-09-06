export const RECON_STATUSES = [
  'MATCHED',
  'DIFFERENCE',
  'MISSING_IN_KANAKKU',
  'MISSING_EXTERNALLY',
  'RESOLVED'
] as const;

export type ReconStatus = (typeof RECON_STATUSES)[number];

export const RECON_EVENT_TYPES = ['PURCHASE', 'REFUND', 'PAYMENT', 'USAGE'] as const;

export type ReconEventType = (typeof RECON_EVENT_TYPES)[number];

export type ReconJournalLine = {
  side: 'DEBIT' | 'CREDIT';
  accountCode: string;
  accountName: string;
  amount: number;
};

export type ReconParty = {
  id: string;
  reference: string | null;
  counterparty: string;
  description: string;
  amount: number;
  currency: 'INR';
  date: string;
  type: ReconEventType;
  sequence: number;
  lines: ReconJournalLine[];
};

export type ReconciliationItem = {
  id: string;
  external: ReconParty | null;
  kanakku: ReconParty | null;
  status: ReconStatus;
  difference: number | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
};

export type ReconciliationRun = {
  id: string;
  name: string;
  sourceLabel: string;
  date: string;
  status: 'OPEN' | 'CLOSED';
  items: ReconciliationItem[];
};

export type ReconSummary = {
  itemCount: number;
  externalTotal: number;
  matched: number;
  differences: number;
  missing: number;
  missingInKanakku: number;
  missingExternally: number;
  resolved: number;
};

export type ReconFilter = 'all' | 'matched' | 'differences' | 'missing' | 'resolved';

export function summarizeRecon(items: readonly ReconciliationItem[]): ReconSummary {
  let externalTotal = 0;
  let matched = 0;
  let differences = 0;
  let missingInKanakku = 0;
  let missingExternally = 0;
  let resolved = 0;
  for (const item of items) {
    if (item.external !== null) {
      externalTotal += item.external.amount;
    }
    if (item.status === 'MATCHED') {
      matched += 1;
    } else if (item.status === 'DIFFERENCE') {
      differences += 1;
    } else if (item.status === 'MISSING_IN_KANAKKU') {
      missingInKanakku += 1;
    } else if (item.status === 'MISSING_EXTERNALLY') {
      missingExternally += 1;
    } else {
      resolved += 1;
    }
  }
  return {
    itemCount: items.length,
    externalTotal,
    matched,
    differences,
    missing: missingInKanakku + missingExternally,
    missingInKanakku,
    missingExternally,
    resolved
  };
}

export function filterReconItems(
  items: readonly ReconciliationItem[],
  filter: ReconFilter
): ReconciliationItem[] {
  if (filter === 'all') {
    return [...items];
  }
  if (filter === 'matched') {
    return items.filter((item) => item.status === 'MATCHED');
  }
  if (filter === 'differences') {
    return items.filter((item) => item.status === 'DIFFERENCE');
  }
  if (filter === 'missing') {
    return items.filter((item) => item.status === 'MISSING_IN_KANAKKU' || item.status === 'MISSING_EXTERNALLY');
  }
  return items.filter((item) => item.status === 'RESOLVED');
}

export function resolveReconItem(
  item: ReconciliationItem,
  reason: string,
  resolvedAt: string
): ReconciliationItem {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return item;
  }
  if (item.status === 'MATCHED' || item.status === 'RESOLVED') {
    return item;
  }
  return {
    ...item,
    status: 'RESOLVED',
    resolutionReason: trimmed,
    resolvedAt
  };
}

export function applyResolutions(
  items: readonly ReconciliationItem[],
  resolutions: Readonly<Record<string, { reason: string; resolvedAt: string }>>
): ReconciliationItem[] {
  return items.map((item) => {
    const resolution = resolutions[item.id];
    if (resolution === undefined) {
      return item;
    }
    return resolveReconItem(item, resolution.reason, resolution.resolvedAt);
  });
}

export function itemSequence(item: ReconciliationItem): number {
  const external = item.external?.sequence;
  const kanakku = item.kanakku?.sequence;
  if (external !== undefined && kanakku !== undefined) {
    return Math.min(external, kanakku);
  }
  return external ?? kanakku ?? 0;
}
