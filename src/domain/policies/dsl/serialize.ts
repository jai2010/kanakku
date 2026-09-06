import { DslCondition, DslLine, DslPolicy, DslValue } from './ast';

export function serializePolicyDsl(policy: DslPolicy): string {
  const lines: string[] = [
    `POLICY ${quote(policy.name)}`,
    `VERSION ${policy.version}`,
    `EFFECTIVE FROM ${quote(policy.effectiveFrom)}`
  ];
  if (policy.effectiveTo !== undefined) {
    lines.push(`EFFECTIVE TO ${quote(policy.effectiveTo)}`);
  }
  for (const rule of policy.rules) {
    lines.push('');
    lines.push(`RULE ${quote(rule.name)}`);
    lines.push(`PRIORITY ${rule.priority}`);
    lines.push('WHEN');
    lines.push(serializeCondition(rule.when, false));
    lines.push('THEN');
    for (const line of rule.lines) {
      lines.push(serializeLine(line));
    }
  }
  return lines.join('\n') + '\n';
}

function serializeCondition(condition: DslCondition, wrapOr: boolean): string {
  switch (condition.kind) {
    case 'compare':
      return `${condition.field} ${condition.operator} ${serializeValue(condition.value)}`;
    case 'in':
      return `${condition.field} ${condition.negated ? 'NOT IN' : 'IN'} [${condition.values.map(serializeValue).join(', ')}]`;
    case 'exists':
      return `${condition.field} EXISTS`;
    case 'not':
      return `NOT (${serializeCondition(condition.item, false)})`;
    case 'and': {
      return condition.items
        .map((item) => serializeCondition(item, true))
        .join('\nAND ');
    }
    case 'or': {
      const body = condition.items
        .map((item) => serializeCondition(item, false))
        .join('\nOR ');
      return wrapOr ? `(${body})` : body;
    }
  }
}

function serializeLine(line: DslLine): string {
  const amount = serializeAmount(line);
  const description = line.description !== undefined ? ` DESCRIPTION ${quote(line.description)}` : '';
  return `${line.side} ACCOUNT ${quote(line.accountCode)} AMOUNT ${amount}${description}`;
}

function serializeAmount(line: DslLine): string {
  if (line.amount.kind === 'event') {
    return 'EVENT_AMOUNT';
  }
  if (line.amount.kind === 'fixed') {
    return `FIXED_AMOUNT ${line.amount.value} ${quote(line.amount.currency)}`;
  }
  if (line.amount.kind === 'rate') {
    return `RATE_AMOUNT ${line.amount.rate}`;
  }
  return `ATTRIBUTE_AMOUNT ${line.amount.attribute}`;
}

function serializeValue(value: DslValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return quote(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function quote(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}"`;
}


