import { LLMProvider, LLMRequest, LLMResponse } from './LLMContract';

export class LLMGateway {
  constructor(private readonly provider: LLMProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  complete(request: LLMRequest): Promise<LLMResponse> {
    return this.provider.complete({
      systemInstruction: request.systemInstruction,
      userInput: formatUserInput(request)
    });
  }
}

function formatUserInput(request: LLMRequest): string {
  if (request.context === undefined) {
    return request.userInput;
  }
  const entries = Object.entries(request.context);
  if (entries.length === 0) {
    return request.userInput;
  }
  const rendered = entries.map(([key, value]) => `${key}: ${value}`).join('\n');
  return `${request.userInput}\n\nContext:\n${rendered}`;
}
