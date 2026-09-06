import { z } from 'zod';
import { LLMProvider, LLMProviderError, LLMRequest, LLMResponse } from '../../application/ai/LLMContract';
import { FetchLike, postJson, resolveFetch } from './http';

const AnthropicMessageSchema = z.object({
  model: z.string().optional(),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional()
  })),
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional()
  }).optional()
});

export type AnthropicProviderOptions = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
};

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: AnthropicProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = resolveFetch(options.fetchImpl);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    if (this.apiKey !== undefined) {
      headers['x-api-key'] = this.apiKey;
    }

    const payload = await postJson({
      provider: this.name,
      url: `${this.baseUrl}/messages`,
      headers,
      body: {
        model: this.model,
        max_tokens: 4096,
        system: request.systemInstruction,
        messages: [{ role: 'user', content: request.userInput }]
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl
    });

    const parsed = AnthropicMessageSchema.safeParse(payload);
    if (!parsed.success) {
      throw new LLMProviderError(this.name, 'anthropic returned an unexpected message shape');
    }

    const textBlock = parsed.data.content.find((block) => block.type === 'text' && block.text !== undefined);
    if (textBlock?.text === undefined || textBlock.text.length === 0) {
      throw new LLMProviderError(this.name, 'anthropic returned empty text');
    }

    return {
      text: textBlock.text,
      provider: this.name,
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : { model: this.model }),
      ...(parsed.data.usage === undefined ? {} : {
        usage: {
          ...(parsed.data.usage.input_tokens !== undefined ? { inputTokens: parsed.data.usage.input_tokens } : {}),
          ...(parsed.data.usage.output_tokens !== undefined ? { outputTokens: parsed.data.usage.output_tokens } : {})
        }
      })
    };
  }
}
