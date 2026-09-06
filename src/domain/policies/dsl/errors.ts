export class PolicyDslError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} at ${line}:${column}`);
    this.name = 'PolicyDslError';
    this.line = line;
    this.column = column;
  }
}
