export type AuthoringIntent =
  | { kind: 'CLEAR' }
  | { kind: 'NEEDS_CLARIFICATION'; needs: string[] }
  | { kind: 'UNSUPPORTED'; reason: string };

const UNSUPPORTED_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(gst|vat|hst|sales tax|withholding tax)\b/i, reason: 'Tax accounting is not in the SUTRA MVP kernel.' },
  { pattern: /\b(ocr|receipt scan|email inbox|gmail)\b/i, reason: 'Document ingestion is not a policy-authoring capability.' },
  { pattern: /\b(multi-?currenc|foreign exchange|\bfx\b|currency conversion)\b/i, reason: 'Multicurrency is not in the SUTRA MVP kernel.' },
  { pattern: /\b(amortiz|revenue recognition|deferred revenue)\b/i, reason: 'Revenue recognition schedules are not in the SUTRA MVP kernel.' },
  { pattern: /\b(payroll|salary|depreciat|inventory|fifo|lifo)\b/i, reason: 'That accounting topic is not in the SUTRA MVP kernel.' },
  { pattern: /\b(roommate|split the bill|venmo|personal budget)\b/i, reason: 'Personal-finance splitting is not a SUTRA accounting policy.' }
];

export function inspectAuthoringIntent(instruction: string): AuthoringIntent {
  const text = instruction.trim();
  if (text.length === 0) {
    return {
      kind: 'NEEDS_CLARIFICATION',
      needs: ['Describe the accounting policy in a full sentence.']
    };
  }

  for (const candidate of UNSUPPORTED_PATTERNS) {
    if (candidate.pattern.test(text)) {
      return { kind: 'UNSUPPORTED', reason: candidate.reason };
    }
  }

  const needs: string[] = [];
  if (!hasAmount(text)) {
    needs.push('What amount qualifies as the threshold?');
  }
  if (!hasDebitAccount(text)) {
    needs.push('Which debit account should be used?');
  }
  if (!hasCreditAccount(text)) {
    needs.push('Which credit account should be used?');
  }

  if (needs.length > 0) {
    return { kind: 'NEEDS_CLARIFICATION', needs };
  }
  return { kind: 'CLEAR' };
}

function hasAmount(text: string): boolean {
  return /\d/.test(text);
}

function hasDebitAccount(text: string): boolean {
  return /\b(5220|5000)\b/.test(text)
    || /\bdebit(?:ing)?\s+\d{4}\b/i.test(text)
    || /\bbusiness meals\b/i.test(text)
    || /\bmisc(?:ellaneous)? expense\b/i.test(text);
}

function hasCreditAccount(text: string): boolean {
  return /\b(2000|2100)\b/.test(text)
    || /\bcredit(?:ing)?\s+\d{4}\b/i.test(text)
    || /\bcash\b/i.test(text)
    || /\baccounts payable\b/i.test(text)
    || /\bpayable\b/i.test(text);
}
