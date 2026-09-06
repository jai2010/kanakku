import { z } from 'zod';
import { parseDomain } from '../parse';

export const TransactionalEffectType = z.enum([
  'WALLET_LOAD',
  'WALLET_SPEND',
  'SALE',
  'FEE',
  'TAX',
  'COMMISSION',
  'WITHHOLDING',
  'ADJUSTMENT',
  'PAYOUT'
]);

export type TransactionalEffectType = z.infer<typeof TransactionalEffectType>;

export const TransactionalDirection = z.enum(['CREDIT', 'DEBIT']);
export type TransactionalDirection = z.infer<typeof TransactionalDirection>;

export const TransactionalEntrySchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  businessEventId: z.string().uuid(),
  type: TransactionalEffectType,
  amount: z.number().finite().positive(),
  direction: TransactionalDirection,
  description: z.string().min(1),
  effectiveAt: z.date(),
  createdAt: z.date()
});

export type TransactionalEntry = z.infer<typeof TransactionalEntrySchema>;

export const createTransactionalEntry = (
  input: Omit<TransactionalEntry, 'id' | 'createdAt'> & Partial<Pick<TransactionalEntry, 'id' | 'createdAt'>>
): TransactionalEntry => {
  return parseDomain(TransactionalEntrySchema, {
    id: input.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    businessEventId: input.businessEventId,
    type: input.type,
    amount: input.amount,
    direction: input.direction,
    description: input.description,
    effectiveAt: input.effectiveAt,
    createdAt: input.createdAt ?? new Date()
  }, 'TransactionalEntry');
};

export function signedDelta(direction: TransactionalDirection, amount: number): number {
  return direction === 'CREDIT' ? amount : -amount;
}

export function compareTransactionalEntries(left: TransactionalEntry, right: TransactionalEntry): number {
  const byTime = left.effectiveAt.getTime() - right.effectiveAt.getTime();
  if (byTime !== 0) {
    return byTime;
  }
  const byCreated = left.createdAt.getTime() - right.createdAt.getTime();
  if (byCreated !== 0) {
    return byCreated;
  }
  return left.id.localeCompare(right.id);
}

export function deriveBalance(entries: readonly TransactionalEntry[]): number {
  return entries.reduce((sum, entry) => sum + signedDelta(entry.direction, entry.amount), 0);
}

export type TransactionalLedgerLine = {
  entry: TransactionalEntry;
  runningBalance: number;
};

export function runningLedger(entries: readonly TransactionalEntry[]): TransactionalLedgerLine[] {
  const ordered = [...entries].sort(compareTransactionalEntries);
  let running = 0;
  return ordered.map((entry) => {
    running += signedDelta(entry.direction, entry.amount);
    return { entry, runningBalance: running };
  });
}
