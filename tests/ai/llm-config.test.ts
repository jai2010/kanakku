import { readLLMRuntimeConfig } from '../../src/infrastructure/ai/llmConfig';
import { createLLMProvider } from '../../src/infrastructure/ai/createLLMProvider';
import { OmniRouteProvider } from '../../src/infrastructure/ai/OmniRouteProvider';
import { FakeLLMProvider } from '../../src/infrastructure/ai/FakeLLMProvider';
import { AnthropicProvider } from '../../src/infrastructure/ai/AnthropicProvider';

describe('LLM runtime configuration', () => {
  it('defaults to fake so CI does not require a live model', () => {
    const config = readLLMRuntimeConfig({});
    expect(config.provider).toBe('fake');
    expect(config.model).toBe('fake');
    expect(createLLMProvider(config)).toBeInstanceOf(FakeLLMProvider);
  });

  it('selects OmniRoute by configuration, not code changes', () => {
    const config = readLLMRuntimeConfig({
      LLM_PROVIDER: 'omniroute',
      LLM_MODEL: 'grok'
    });
    expect(config.provider).toBe('omniroute');
    expect(config.model).toBe('grok');
    expect(config.baseUrl).toBe('http://127.0.0.1:20128/v1');
    expect(createLLMProvider(config)).toBeInstanceOf(OmniRouteProvider);
  });

  it('switches model on the same OmniRoute provider via LLM_MODEL', () => {
    const grok = readLLMRuntimeConfig({ LLM_PROVIDER: 'omniroute', LLM_MODEL: 'grok' });
    const deepseek = readLLMRuntimeConfig({ LLM_PROVIDER: 'omniroute', LLM_MODEL: 'deepseek' });
    expect(grok.provider).toBe(deepseek.provider);
    expect(grok.model).toBe('grok');
    expect(deepseek.model).toBe('deepseek');
  });

  it('selects Anthropic, xAI, DeepSeek, and OpenAI-compatible endpoints from env', () => {
    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'anthropic',
      LLM_MODEL: 'claude'
    }))).toBeInstanceOf(AnthropicProvider);

    const xai = readLLMRuntimeConfig({ LLM_PROVIDER: 'xai', LLM_MODEL: 'grok-4.5' });
    expect(xai.baseUrl).toBe('https://api.x.ai/v1');

    const deepseek = readLLMRuntimeConfig({ LLM_PROVIDER: 'deepseek', LLM_MODEL: 'deepseek-chat' });
    expect(deepseek.baseUrl).toBe('https://api.deepseek.com/v1');

    const custom = readLLMRuntimeConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_MODEL: 'local-model',
      LLM_BASE_URL: 'http://127.0.0.1:8080/v1'
    });
    expect(custom.baseUrl).toBe('http://127.0.0.1:8080/v1');
  });

  it('does not hard-code API keys and requires a model for non-default providers', () => {
    const config = readLLMRuntimeConfig({
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4o-mini',
      LLM_API_KEY: 'secret-from-env'
    });
    expect(config.apiKey).toBe('secret-from-env');
    expect(() => readLLMRuntimeConfig({ LLM_PROVIDER: 'openai' })).toThrow('LLM_MODEL is required');
    expect(() => readLLMRuntimeConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'x' }))
      .toThrow('LLM_BASE_URL is required');
  });
});
