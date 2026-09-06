import { DslAmount, DslCompareOperator, DslCondition, DslLine, DslPolicy, DslRule, DslValue } from './ast';
import { PolicyDslError } from './errors';
import { tokenizePolicyDsl } from './lexer';
import { Token, TokenKind } from './tokens';

export function parsePolicyDsl(source: string): DslPolicy {
  return new Parser(tokenizePolicyDsl(source)).parsePolicy();
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parsePolicy(): DslPolicy {
    const start = this.peek();
    this.expect('POLICY');
    const name = this.expectNonEmptyString('POLICY name');
    this.expect('VERSION');
    const version = this.expectPositiveInt('VERSION');

    let effectiveFrom: string | undefined;
    let effectiveTo: string | undefined;
    while (this.check('EFFECTIVE')) {
      this.advance();
      if (this.match('FROM')) {
        if (effectiveFrom !== undefined) {
          throw this.error('Duplicate EFFECTIVE FROM');
        }
        effectiveFrom = this.expectString('EFFECTIVE FROM date');
      } else if (this.match('TO')) {
        if (effectiveTo !== undefined) {
          throw this.error('Duplicate EFFECTIVE TO');
        }
        effectiveTo = this.expectString('EFFECTIVE TO date');
      } else {
        throw this.error('Expected FROM or TO after EFFECTIVE');
      }
    }

    if (effectiveFrom === undefined) {
      throw this.error('Missing EFFECTIVE FROM');
    }

    const rules: DslRule[] = [];
    const ruleNames = new Set<string>();
    if (!this.check('RULE')) {
      throw this.error('Expected RULE');
    }
    while (this.check('RULE')) {
      const rule = this.parseRule();
      if (ruleNames.has(rule.name)) {
        throw new PolicyDslError(`Duplicate RULE name ${JSON.stringify(rule.name)}`, rule.loc.line, rule.loc.column);
      }
      ruleNames.add(rule.name);
      rules.push(rule);
    }

    this.expect('EOF');
    return {
      name,
      version,
      effectiveFrom,
      ...(effectiveTo !== undefined ? { effectiveTo } : {}),
      rules,
      loc: { line: start.line, column: start.column }
    };
  }

  private parseRule(): DslRule {
    const start = this.peek();
    this.expect('RULE');
    const name = this.expectNonEmptyString('RULE name');
    this.expect('PRIORITY');
    const priority = this.expectInt('PRIORITY');
    this.expect('WHEN');
    const when = this.parseOr();
    this.expect('THEN');
    const lines = this.parseLines();
    if (lines.length < 2) {
      throw new PolicyDslError('THEN must contain at least two journal lines', start.line, start.column);
    }
    const hasDebit = lines.some((line) => line.side === 'DEBIT');
    const hasCredit = lines.some((line) => line.side === 'CREDIT');
    if (!hasDebit || !hasCredit) {
      throw new PolicyDslError('THEN must contain at least one DEBIT and one CREDIT', start.line, start.column);
    }
    return {
      name,
      priority,
      when,
      lines,
      loc: { line: start.line, column: start.column }
    };
  }

  private parseLines(): DslLine[] {
    const lines: DslLine[] = [];
    while (this.check('DEBIT') || this.check('CREDIT')) {
      lines.push(this.parseLine());
    }
    if (lines.length === 0) {
      throw this.error('Expected DEBIT or CREDIT after THEN');
    }
    return lines;
  }

  private parseLine(): DslLine {
    const start = this.peek();
    const side = this.match('DEBIT') ? 'DEBIT' : this.match('CREDIT') ? 'CREDIT' : null;
    if (side === null) {
      throw this.error('Expected DEBIT or CREDIT');
    }
    this.expect('ACCOUNT');
    const accountCode = this.expectString('account code');
    if (accountCode.length === 0) {
      throw new PolicyDslError('Account code must not be empty', start.line, start.column);
    }
    this.expect('AMOUNT');
    const amount = this.parseAmount();
    let description: string | undefined;
    if (this.match('DESCRIPTION')) {
      description = this.expectString('line description');
    }
    return {
      side,
      accountCode,
      amount,
      ...(description !== undefined ? { description } : {}),
      loc: { line: start.line, column: start.column }
    };
  }

  private parseAmount(): DslAmount {
    if (this.match('EVENT_AMOUNT')) {
      return { kind: 'event' };
    }
    if (this.match('FIXED_AMOUNT')) {
      const value = this.expectNumber('FIXED_AMOUNT value');
      if (!(value > 0)) {
        throw this.error('FIXED_AMOUNT value must be a positive finite number');
      }
      const currency = this.expectString('FIXED_AMOUNT currency');
      if (currency.length !== 3) {
        throw this.error('FIXED_AMOUNT currency must be a 3-letter code');
      }
      return { kind: 'fixed', value, currency };
    }
    if (this.match('ATTRIBUTE_AMOUNT')) {
      const attribute = this.expectIdent('ATTRIBUTE_AMOUNT attribute');
      return { kind: 'attribute', attribute };
    }
    if (this.match('RATE_AMOUNT')) {
      const rate = this.expectNumber('RATE_AMOUNT rate');
      if (!(rate > 0) || rate > 1) {
        throw this.error('RATE_AMOUNT rate must be a positive fraction no greater than 1');
      }
      return { kind: 'rate', rate };
    }
    throw this.error('Expected EVENT_AMOUNT, FIXED_AMOUNT, ATTRIBUTE_AMOUNT, or RATE_AMOUNT');
  }

  private parseOr(): DslCondition {
    const loc = this.location();
    const items = [this.parseAnd()];
    while (this.match('OR')) {
      items.push(this.parseAnd());
    }
    return items.length === 1 ? items[0] : { kind: 'or', items, loc };
  }

  private parseAnd(): DslCondition {
    const loc = this.location();
    const items = [this.parseNot()];
    while (this.match('AND')) {
      items.push(this.parseNot());
    }
    return items.length === 1 ? items[0] : { kind: 'and', items, loc };
  }

  private parseNot(): DslCondition {
    if (this.check('NOT') && !this.checkAhead('IN', 1)) {
      const loc = this.location();
      this.advance();
      return { kind: 'not', item: this.parseNot(), loc };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): DslCondition {
    if (this.match('LPAREN')) {
      const condition = this.parseOr();
      this.expect('RPAREN');
      return condition;
    }
    return this.parseSimple();
  }

  private parseSimple(): DslCondition {
    const loc = this.location();
    const field = this.parseField();
    if (this.match('EXISTS')) {
      return { kind: 'exists', field, loc };
    }
    if (this.check('NOT') && this.checkAhead('IN', 1)) {
      this.advance();
      this.advance();
      return { kind: 'in', field, negated: true, values: this.parseList(), loc };
    }
    if (this.match('IN')) {
      return { kind: 'in', field, negated: false, values: this.parseList(), loc };
    }
    const operator = this.parseCompareOperator();
    const value = this.parseValue();
    return { kind: 'compare', field, operator, value, loc };
  }

  private parseField(): string {
    const parts = [this.expectIdent('field name')];
    while (this.match('DOT')) {
      parts.push(this.expectIdent('field name'));
    }
    return parts.join('.');
  }

  private parseCompareOperator(): DslCompareOperator {
    if (this.match('EQ')) return '=';
    if (this.match('NE')) return '!=';
    if (this.match('GT')) return '>';
    if (this.match('GE')) return '>=';
    if (this.match('LT')) return '<';
    if (this.match('LE')) return '<=';
    throw this.error('Expected comparison operator, IN, NOT IN, or EXISTS');
  }

  private parseList(): DslValue[] {
    this.expect('LBRACKET');
    const values = [this.parseValue()];
    while (this.match('COMMA')) {
      values.push(this.parseValue());
    }
    this.expect('RBRACKET');
    return values;
  }

  private parseValue(): DslValue {
    if (this.check('STRING') || this.check('NUMBER') || this.check('BOOLEAN') || this.check('NULL')) {
      const token = this.advance();
      if (token.value === undefined) {
        throw new PolicyDslError('Malformed literal', token.line, token.column);
      }
      return token.value;
    }
    throw this.error('Expected a string, number, boolean, or null');
  }

  private expectPositiveInt(label: string): number {
    const value = this.expectInt(label);
    if (value <= 0) {
      throw this.error(`${label} must be a positive integer`);
    }
    return value;
  }

  private expectInt(label: string): number {
    const token = this.expect('NUMBER', label);
    if (typeof token.value !== 'number' || !Number.isInteger(token.value)) {
      throw new PolicyDslError(`${label} must be an integer`, token.line, token.column);
    }
    return token.value;
  }

  private expectNumber(label: string): number {
    const token = this.expect('NUMBER', label);
    if (typeof token.value !== 'number') {
      throw new PolicyDslError(`${label} must be a number`, token.line, token.column);
    }
    return token.value;
  }

  private expectString(label: string): string {
    const token = this.expect('STRING', label);
    if (typeof token.value !== 'string') {
      throw new PolicyDslError(`${label} must be a string`, token.line, token.column);
    }
    return token.value;
  }

  private expectNonEmptyString(label: string): string {
    const token = this.expect('STRING', label);
    if (typeof token.value !== 'string') {
      throw new PolicyDslError(`${label} must be a string`, token.line, token.column);
    }
    if (token.value.length === 0) {
      throw new PolicyDslError(`${label} must not be empty`, token.line, token.column);
    }
    return token.value;
  }

  private expectIdent(label: string): string {
    const token = this.expect('IDENT', label);
    return token.lexeme;
  }

  private expect(kind: TokenKind, label?: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }
    const token = this.peek();
    throw new PolicyDslError(
      `Expected ${label ?? kind}, found ${token.kind}`,
      token.line,
      token.column
    );
  }

  private match(kind: TokenKind): boolean {
    if (!this.check(kind)) {
      return false;
    }
    this.advance();
    return true;
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkAhead(kind: TokenKind, offset: number): boolean {
    return this.tokens[this.index + offset]?.kind === kind;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== 'EOF') {
      this.index += 1;
    }
    return token;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
  }

  private location() {
    const token = this.peek();
    return { line: token.line, column: token.column };
  }

  private error(message: string): PolicyDslError {
    const token = this.peek();
    return new PolicyDslError(message, token.line, token.column);
  }
}
