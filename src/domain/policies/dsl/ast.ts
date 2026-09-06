export type DslLocation = {
  line: number;
  column: number;
};

export type DslValue = string | number | boolean | null;

export type DslCompareOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';

export type DslCondition =
  | { kind: 'compare'; field: string; operator: DslCompareOperator; value: DslValue; loc: DslLocation }
  | { kind: 'in'; field: string; negated: boolean; values: DslValue[]; loc: DslLocation }
  | { kind: 'exists'; field: string; loc: DslLocation }
  | { kind: 'and'; items: DslCondition[]; loc: DslLocation }
  | { kind: 'or'; items: DslCondition[]; loc: DslLocation }
  | { kind: 'not'; item: DslCondition; loc: DslLocation };

export type DslAmount =
  | { kind: 'event' }
  | { kind: 'fixed'; value: number; currency: string }
  | { kind: 'attribute'; attribute: string }
  | { kind: 'rate'; rate: number };

export type DslLine = {
  side: 'DEBIT' | 'CREDIT';
  accountCode: string;
  amount: DslAmount;
  description?: string;
  loc: DslLocation;
};

export type DslRule = {
  name: string;
  priority: number;
  when: DslCondition;
  lines: DslLine[];
  loc: DslLocation;
};

export type DslPolicy = {
  name: string;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string;
  rules: DslRule[];
  loc: DslLocation;
};
