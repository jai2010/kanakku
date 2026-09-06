import { BusinessEvent } from '../events/BusinessEvent';
import { resolveEventField } from '../events/resolveEventField';
import { ParticipantAccount, ParticipantKind } from './ParticipantAccount';
import {
  TransactionalDirection,
  TransactionalEffectType,
  TransactionalEntry,
  createTransactionalEntry,
  deriveBalance,
  signedDelta
} from './TransactionalEntry';

export type TransactionalAmountSpec =
  | { type: 'EVENT_AMOUNT' }
  | { type: 'FIXED'; value: number }
  | { type: 'RATE'; rate: number };

export type TransactionalEffectSpec = {
  type: TransactionalEffectType;
  direction: TransactionalDirection;
  amount: TransactionalAmountSpec;
  description: string;
};

export type TransactionalTreatment = {
  participantKind: ParticipantKind;
  participantField: string;
  effects: TransactionalEffectSpec[];
};

export function moneyAmount(value: number): number {
  return Math.round(value);
}

export function resolveTransactionalAmount(
  eventAmount: number | undefined,
  spec: TransactionalAmountSpec
): number | null {
  if (spec.type === 'FIXED') {
    return spec.value > 0 && Number.isFinite(spec.value) ? moneyAmount(spec.value) : null;
  }
  if (eventAmount === undefined || !Number.isFinite(eventAmount) || eventAmount <= 0) {
    return null;
  }
  if (spec.type === 'RATE') {
    if (!Number.isFinite(spec.rate) || spec.rate <= 0) {
      return null;
    }
    const resolved = moneyAmount(eventAmount * spec.rate);
    return resolved > 0 ? resolved : null;
  }
  return moneyAmount(eventAmount);
}

export function participantIdFromEvent(event: BusinessEvent, field: string): string | null {
  const resolved = resolveEventField(event, field);
  if (resolved.kind === 'MISSING') {
    return null;
  }
  if (typeof resolved.value !== 'string' || resolved.value.trim().length === 0) {
    return null;
  }
  return resolved.value.trim();
}

export function materializeTransactionalEntries(input: {
  event: BusinessEvent;
  account: ParticipantAccount;
  treatment: TransactionalTreatment;
  createdAt?: Date;
}): TransactionalEntry[] {
  const createdAt = input.createdAt ?? input.event.createdAt;
  const entries: TransactionalEntry[] = [];
  for (const spec of input.treatment.effects) {
    const amount = resolveTransactionalAmount(input.event.amount, spec.amount);
    if (amount === null) {
      continue;
    }
    entries.push(createTransactionalEntry({
      accountId: input.account.id,
      businessEventId: input.event.id,
      type: spec.type,
      amount,
      direction: spec.direction,
      description: spec.description,
      effectiveAt: input.event.occurredAt,
      createdAt: new Date(createdAt.getTime() + entries.length)
    }));
  }
  return entries;
}

export type CompositionLine = {
  type: TransactionalEffectType;
  description: string;
  amount: number;
  direction: TransactionalDirection;
  signedAmount: number;
};

export type TransactionalComposition = {
  lines: CompositionLine[];
  total: number;
};

const DEDUCTION_TYPES = new Set<TransactionalEffectType>([
  'FEE',
  'TAX',
  'COMMISSION',
  'WITHHOLDING',
  'ADJUSTMENT',
  'PAYOUT',
  'WALLET_SPEND'
]);

export function composeEventEffects(entries: readonly TransactionalEntry[]): TransactionalComposition {
  const lines = entries.map((entry) => ({
    type: entry.type,
    description: entry.description,
    amount: entry.amount,
    direction: entry.direction,
    signedAmount: signedDelta(entry.direction, entry.amount)
  }));
  return {
    lines,
    total: deriveBalance(entries)
  };
}

export function isDeductionType(type: TransactionalEffectType): boolean {
  return DEDUCTION_TYPES.has(type);
}
