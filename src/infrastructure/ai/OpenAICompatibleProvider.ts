import { z } from 'zod';
import { LLMProvider, LLMProviderError, LLMRequest, LLMResponse } from '../../application/ai/LLMContract';
import { FetchLike, postJson, resolveFetch } from './http';

const ChatCompletionSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({
      content: z.union([z.string(), z.null()]).optional()
    }).optional()
  })),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional()
  }).optional()
});

export type OpenAICompatibleProviderOptions = {
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
};

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = resolveFetch(options.fetchImpl);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey !== undefined) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const payload = await postJson({
      provider: this.name,
      url: `${this.baseUrl}/chat/completions`,
      headers,
      body: {
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: request.systemInstruction },
          { role: 'user', content: request.userInput }
        ]
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl
    });

    const parsed = ChatCompletionSchema.safeParse(payload);
    if (!parsed.success) {
      throw new LLMProviderError(this.name, `${this.name} returned an unexpected chat completion shape`);
    }

    const text = parsed.data.choices[0]?.message?.content;
    if (text === undefined || text === null || text.length === 0) {
      throw new LLMProviderError(this.name, `${this.name} returned empty text`);
    }

    return {
      text,
      provider: this.name,
      ...(parsed.data.model !== undefined ? { model: parsed.data.model } : { model: this.model }),
      ...(parsed.data.usage === undefined ? {} : {
        usage: {
          ...(parsed.data.usage.prompt_tokens !== undefined ? { inputTokens: parsed.data.usage.prompt_tokens } : {}),
          ...(parsed.data.usage.completion_tokens !== undefined ? { outputTokens: parsed.data.usage.completion_tokens } : {}),
          ...(parsed.data.usage.total_tokens !== undefined ? { totalTokens: parsed.data.usage.total_tokens } : {})
        }
      })
    };
  }
}
