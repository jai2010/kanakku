export type TokenKind =
  | 'POLICY'
  | 'VERSION'
  | 'EFFECTIVE'
  | 'FROM'
  | 'TO'
  | 'RULE'
  | 'PRIORITY'
  | 'WHEN'
  | 'THEN'
  | 'DEBIT'
  | 'CREDIT'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'IN'
  | 'EXISTS'
  | 'EVENT_AMOUNT'
  | 'FIXED_AMOUNT'
  | 'ATTRIBUTE_AMOUNT'
  | 'RATE_AMOUNT'
  | 'ACCOUNT'
  | 'AMOUNT'
  | 'DESCRIPTION'
  | 'IDENT'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'EQ'
  | 'NE'
  | 'GT'
  | 'GE'
  | 'LT'
  | 'LE'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'DOT'
  | 'EOF';

export type Token = {
  kind: TokenKind;
  lexeme: string;
  value?: string | number | boolean | null;
  line: number;
  column: number;
};

export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map([
  ['POLICY', 'POLICY'],
  ['VERSION', 'VERSION'],
  ['EFFECTIVE', 'EFFECTIVE'],
  ['FROM', 'FROM'],
  ['TO', 'TO'],
  ['RULE', 'RULE'],
  ['PRIORITY', 'PRIORITY'],
  ['WHEN', 'WHEN'],
  ['THEN', 'THEN'],
  ['DEBIT', 'DEBIT'],
  ['CREDIT', 'CREDIT'],
  ['AND', 'AND'],
  ['OR', 'OR'],
  ['NOT', 'NOT'],
  ['IN', 'IN'],
  ['EXISTS', 'EXISTS'],
  ['EVENT_AMOUNT', 'EVENT_AMOUNT'],
  ['FIXED_AMOUNT', 'FIXED_AMOUNT'],
  ['ATTRIBUTE_AMOUNT', 'ATTRIBUTE_AMOUNT'],
  ['RATE_AMOUNT', 'RATE_AMOUNT'],
  ['ACCOUNT', 'ACCOUNT'],
  ['AMOUNT', 'AMOUNT'],
  ['DESCRIPTION', 'DESCRIPTION']
]);
