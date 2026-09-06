import { LLMGateway } from '../../src/application/ai/LLMGateway';
import { OpenAICompatibleProvider } from '../../src/infrastructure/ai/OpenAICompatibleProvider';
import { OmniRouteProvider } from '../../src/infrastructure/ai/OmniRouteProvider';
import { AnthropicProvider } from '../../src/infrastructure/ai/AnthropicProvider';
import { FakeLLMProvider } from '../../src/infrastructure/ai/FakeLLMProvider';
import { FetchLike } from '../../src/infrastructure/ai/http';

function jsonFetch(status: number, body: unknown, onRequest?: (url: string, init: { body: string; headers: Record<string, string> }) => void): FetchLike {
  return async (url, init) => {
    if (onRequest !== undefined) {
      onRequest(url, init);
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body)
    };
  };
}

describe('LLM providers', () => {
  it('FakeLLMProvider is deterministic and records the provider-neutral request', async () => {
    const fake = new FakeLLMProvider({ text: 'POLICY "A"' });
    const gateway = new LLMGateway(fake);
    const response = await gateway.complete({
      systemInstruction: 'sys',
      userInput: 'write a policy',
      context: { accountCodes: '5220, 2000' }
    });
    expect(response.text).toBe('POLICY "A"');
    expect(response.provider).toBe('fake');
    expect(fake.lastRequest?.userInput).toContain('write a policy');
    expect(fake.lastRequest?.userInput).toContain('accountCodes: 5220, 2000');
    expect(fake.lastRequest?.systemInstruction).toBe('sys');
  });

  it('OmniRoute adapter uses the OpenAI-compatible wire protocol without leaking it to the gateway', async () => {
    let requestedUrl = '';
    let requestedBody = '';
    const provider = new OmniRouteProvider({
      baseUrl: 'http://127.0.0.1:20128/v1',
      model: 'auto',
      apiKey: 'omni-key',
      timeoutMs: 1000,
      fetchImpl: jsonFetch(200, {
        model: 'auto',
        choices: [{ message: { content: 'POLICY "From OmniRoute"' } }],
        usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 }
      }, (url, init) => {
        requestedUrl = url;
        requestedBody = init.body;
        expect(init.headers.Authorization).toBe('Bearer omni-key');
      })
    });

    const response = await new LLMGateway(provider).complete({
      systemInstruction: 'sys',
      userInput: 'user'
    });

    expect(provider.name).toBe('omniroute');
    expect(requestedUrl).toBe('http://127.0.0.1:20128/v1/chat/completions');
    const requested: unknown = JSON.parse(requestedBody);
    expect(requested).toEqual({
      model: 'auto',
      stream: false,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'user' }
      ]
    });
    expect(response).toEqual({
      text: 'POLICY "From OmniRoute"',
      provider: 'omniroute',
      model: 'auto',
      usage: { inputTokens: 11, outputTokens: 4, totalTokens: 15 }
    });
  });

  it('OpenAI-compatible and Anthropic adapters stay behind the same LLMResponse', async () => {
    const openai = new OpenAICompatibleProvider({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 1000,
      fetchImpl: jsonFetch(200, {
        choices: [{ message: { content: 'hello openai' } }]
      })
    });
    const anthropic = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude',
      apiKey: 'anthropic-key',
      timeoutMs: 1000,
      fetchImpl: jsonFetch(200, {
        model: 'claude',
        content: [{ type: 'text', text: 'hello claude' }],
        usage: { input_tokens: 2, output_tokens: 3 }
      }, (_url, init) => {
        expect(init.headers['x-api-key']).toBe('anthropic-key');
        expect(init.headers['anthropic-version']).toBe('2023-06-01');
      })
    });

    expect((await openai.complete({ systemInstruction: 's', userInput: 'u' })).text).toBe('hello openai');
    expect((await anthropic.complete({ systemInstruction: 's', userInput: 'u' })).text).toBe('hello claude');
  });

  it('fails closed on HTTP errors without inventing text', async () => {
    const provider = new OmniRouteProvider({
      baseUrl: 'http://127.0.0.1:20128/v1',
      model: 'auto',
      timeoutMs: 1000,
      fetchImpl: jsonFetch(503, { error: 'down' })
    });
    await expect(provider.complete({ systemInstruction: 's', userInput: 'u' }))
      .rejects.toThrow('omniroute HTTP 503');
  });
});
