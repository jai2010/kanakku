import { BusinessEvent } from '../events/BusinessEvent';
import { isEventAttributeIdentifier, resolveEventField } from '../events/resolveEventField';

export type AttributeAmountResult =
  | { kind: 'OK'; amount: number }
  | { kind: 'INVALID' };

function invalid(): AttributeAmountResult {
  return { kind: 'INVALID' };
}

export function resolveFiniteNumber(value: unknown): AttributeAmountResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid();
  }
  return { kind: 'OK', amount: value };
}

/**
 * Resolve ATTRIBUTE_AMOUNT using closed source resolution.
 * Missing, non-numeric, and non-finite values fail closed — never coerced to zero.
 */
export function resolveAttributeAmount(
  event: BusinessEvent,
  attribute: string | undefined
): AttributeAmountResult {
  if (attribute === undefined || !isEventAttributeIdentifier(attribute)) {
    return invalid();
  }

  const resolved = resolveEventField(event, `attributes.${attribute}`);
  if (resolved.kind === 'MISSING') {
    return invalid();
  }

  return resolveFiniteNumber(resolved.value);
}

/**
 * Resolve RATE_AMOUNT as a rounded fraction of the event amount.
 * Missing or non-finite event amounts fail closed.
 */
export function resolveRateAmount(
  eventAmount: unknown,
  rate: number | undefined
): AttributeAmountResult {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    return invalid();
  }
  const base = resolveFiniteNumber(eventAmount);
  if (base.kind === 'INVALID') {
    return invalid();
  }
  const amount = Math.round(base.amount * rate);
  if (!Number.isFinite(amount) || amount <= 0) {
    return invalid();
  }
  return { kind: 'OK', amount };
}
