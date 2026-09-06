import { PolicyDslError } from './errors';
import { KEYWORDS, Token, TokenKind } from './tokens';

export function tokenizePolicyDsl(source: string): Token[] {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

class Lexer {
  private readonly source: string;
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    for (;;) {
      this.skipWhitespace();
      if (this.isAtEnd()) {
        tokens.push(this.token('EOF', '', this.line, this.column));
        return tokens;
      }
      tokens.push(this.nextToken());
    }
  }

  private nextToken(): Token {
    const line = this.line;
    const column = this.column;
    const char = this.peek();

    if (char === '"') {
      return this.string(line, column);
    }
    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peekNext()))) {
      return this.number(line, column);
    }
    if (this.isIdentStart(char)) {
      return this.identifierOrKeyword(line, column);
    }

    switch (char) {
      case '(':
        this.advance();
        return this.token('LPAREN', '(', line, column);
      case ')':
        this.advance();
        return this.token('RPAREN', ')', line, column);
      case '[':
        this.advance();
        return this.token('LBRACKET', '[', line, column);
      case ']':
        this.advance();
        return this.token('RBRACKET', ']', line, column);
      case ',':
        this.advance();
        return this.token('COMMA', ',', line, column);
      case '.':
        this.advance();
        return this.token('DOT', '.', line, column);
      case '=':
        this.advance();
        return this.token('EQ', '=', line, column);
      case '!':
        this.advance();
        if (this.peek() !== '=') {
          throw new PolicyDslError('Unknown operator "!"', line, column);
        }
        this.advance();
        return this.token('NE', '!=', line, column);
      case '>':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return this.token('GE', '>=', line, column);
        }
        return this.token('GT', '>', line, column);
      case '<':
        this.advance();
        if (this.peek() === '=') {
          this.advance();
          return this.token('LE', '<=', line, column);
        }
        return this.token('LT', '<', line, column);
      default:
        throw new PolicyDslError(`Unexpected character ${JSON.stringify(char)}`, line, column);
    }
  }

  private string(line: number, column: number): Token {
    this.advance();
    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      const char = this.advance();
      if (char === '\\') {
        if (this.isAtEnd()) {
          throw new PolicyDslError('Unterminated string', line, column);
        }
        const escaped = this.advance();
        if (escaped === '"' || escaped === '\\') {
          value += escaped;
        } else if (escaped === 'n') {
          value += '\n';
        } else if (escaped === 'r') {
          value += '\r';
        } else {
          throw new PolicyDslError(`Invalid escape sequence \\${escaped}`, line, column);
        }
      } else if (char === '\n') {
        throw new PolicyDslError('Unterminated string', line, column);
      } else {
        value += char;
      }
    }
    if (this.peek() !== '"') {
      throw new PolicyDslError('Unterminated string', line, column);
    }
    this.advance();
    return this.token('STRING', value, line, column, value);
  }

  private number(line: number, column: number): Token {
    let lexeme = '';
    if (this.peek() === '-') {
      lexeme += this.advance();
    }
    while (this.isDigit(this.peek())) {
      lexeme += this.advance();
    }
    if (this.peek() === '.') {
      lexeme += this.advance();
      if (!this.isDigit(this.peek())) {
        throw new PolicyDslError('Malformed number', line, column);
      }
      while (this.isDigit(this.peek())) {
        lexeme += this.advance();
      }
    }
    const value = Number(lexeme);
    if (!Number.isFinite(value)) {
      throw new PolicyDslError('Malformed number', line, column);
    }
    return this.token('NUMBER', lexeme, line, column, value);
  }

  private identifierOrKeyword(line: number, column: number): Token {
    let lexeme = '';
    while (this.isIdentPart(this.peek())) {
      lexeme += this.advance();
    }
    if (lexeme === 'true' || lexeme === 'false') {
      return this.token('BOOLEAN', lexeme, line, column, lexeme === 'true');
    }
    if (lexeme === 'null') {
      return this.token('NULL', lexeme, line, column, null);
    }
    const keyword = KEYWORDS.get(lexeme);
    if (keyword !== undefined) {
      return this.token(keyword, lexeme, line, column);
    }
    if (lexeme.length >= 2 && this.isUnknownKeyword(lexeme)) {
      throw new PolicyDslError(`Unknown keyword ${lexeme}`, line, column);
    }
    return this.token('IDENT', lexeme, line, column);
  }

  private isUnknownKeyword(lexeme: string): boolean {
    for (let i = 0; i < lexeme.length; i++) {
      const char = lexeme[i];
      if (char === undefined) {
        return false;
      }
      const isUpper = char >= 'A' && char <= 'Z';
      const isDigit = char >= '0' && char <= '9';
      const isUnderscore = char === '_';
      if (i === 0 && !isUpper) {
        return false;
      }
      if (!isUpper && !isDigit && !isUnderscore) {
        return false;
      }
    }
    return true;
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        this.advance();
        continue;
      }
      break;
    }
  }

  private token(
    kind: TokenKind,
    lexeme: string,
    line: number,
    column: number,
    value?: string | number | boolean | null
  ): Token {
    return { kind, lexeme, line, column, value };
  }

  private peek(): string {
    return this.source[this.index] ?? '';
  }

  private peekNext(): string {
    return this.source[this.index + 1] ?? '';
  }

  private advance(): string {
    const char = this.source[this.index] ?? '';
    this.index += 1;
    if (char === '\n') {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return char;
  }

  private isAtEnd(): boolean {
    return this.index >= this.source.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isIdentStart(char: string): boolean {
    return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_';
  }

  private isIdentPart(char: string): boolean {
    return this.isIdentStart(char) || this.isDigit(char);
  }
}
