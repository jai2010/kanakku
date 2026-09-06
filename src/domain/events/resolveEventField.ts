import { BusinessEvent } from './BusinessEvent';

export type SourceResolutionResult =
  | { kind: 'FOUND'; value: unknown }
  | { kind: 'MISSING' };

const ATTRIBUTE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ATTRIBUTE_FIELD_PATTERN = /^attributes\.([A-Za-z_][A-Za-z0-9_]*)$/;

function found(value: unknown): SourceResolutionResult {
  return { kind: 'FOUND', value };
}

function missing(): SourceResolutionResult {
  return { kind: 'MISSING' };
}

function isRejectedAttributeName(name: string): boolean {
  return name === '__proto__' || name === 'constructor' || name === 'prototype';
}

export function isEventAttributeIdentifier(name: string): boolean {
  return ATTRIBUTE_IDENTIFIER_PATTERN.test(name) && !isRejectedAttributeName(name);
}

function resolveOptionalCanonicalValue(value: unknown): SourceResolutionResult {
  if (value === undefined) {
    return missing();
  }
  return found(value);
}

function resolveCanonicalEventField(event: BusinessEvent, field: string): SourceResolutionResult | null {
  switch (field) {
    case 'eventType':
      return found(event.eventType);
    case 'amount':
      return resolveOptionalCanonicalValue(event.amount);
    case 'counterparty':
      return resolveOptionalCanonicalValue(event.counterparty);
    case 'currency':
      return resolveOptionalCanonicalValue(event.currency);
    case 'id':
      return found(event.id);
    case 'tenantId':
      return found(event.tenantId);
    case 'occurredAt':
      return found(event.occurredAt);
    case 'source':
      return resolveOptionalCanonicalValue(event.source);
    case 'createdAt':
      return found(event.createdAt);
    default:
      return null;
  }
}

function resolveEventAttributeField(event: BusinessEvent, field: string): SourceResolutionResult | null {
  const match = ATTRIBUTE_FIELD_PATTERN.exec(field);
  if (match === null) {
    return null;
  }

  const attributeName = match[1];
  if (attributeName === undefined || !isEventAttributeIdentifier(attributeName)) {
    return missing();
  }

  if (!Object.prototype.hasOwnProperty.call(event.attributes, attributeName)) {
    return missing();
  }

  return found(event.attributes[attributeName]);
}

/**
 * Closed source resolution for Policy IR field names.
 * EVENT: explicit canonical BusinessEvent allowlist.
 * EVENT_ATTRIBUTE: attributes.<singleIdentifier> only.
 */
export function resolveEventField(event: BusinessEvent, field: string): SourceResolutionResult {
  const canonical = resolveCanonicalEventField(event, field);
  if (canonical !== null) {
    return canonical;
  }

  const attribute = resolveEventAttributeField(event, field);
  if (attribute !== null) {
    return attribute;
  }

  return missing();
}
