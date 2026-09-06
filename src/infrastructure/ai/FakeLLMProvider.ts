import { LLMProvider, LLMRequest, LLMResponse } from '../../application/ai/LLMContract';

export type FakeLLMHandler = (request: LLMRequest) => string | LLMResponse;

export type FakeLLMProviderOptions = {
  text?: string;
  handler?: FakeLLMHandler;
  model?: string;
};

export class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake';
  lastRequest: LLMRequest | undefined;
  private readonly model: string;
  private readonly text?: string;
  private readonly handler?: FakeLLMHandler;

  constructor(options: FakeLLMProviderOptions = {}) {
    this.model = options.model ?? 'fake';
    this.text = options.text;
    this.handler = options.handler;
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = request;
    if (this.handler !== undefined) {
      const result = this.handler(request);
      if (typeof result === 'string') {
        return { text: result, provider: this.name, model: this.model };
      }
      return {
        ...result,
        provider: result.provider ?? this.name,
        model: result.model ?? this.model
      };
    }
    return {
      text: this.text ?? '',
      provider: this.name,
      model: this.model
    };
  }
}
