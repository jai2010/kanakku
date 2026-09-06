export type LLMRequest = {
  systemInstruction: string;
  userInput: string;
  context?: Readonly<Record<string, string>>;
};

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type LLMResponse = {
  text: string;
  provider?: string;
  model?: string;
  usage?: LLMUsage;
};

export interface LLMProvider {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMProviderError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string) {
    super(message);
    this.name = 'LLMProviderError';
    this.provider = provider;
  }
}
