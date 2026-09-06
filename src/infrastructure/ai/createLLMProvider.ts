import { LLMProvider } from '../../application/ai/LLMContract';
import { AnthropicProvider } from './AnthropicProvider';
import { FakeLLMProvider, FakeLLMHandler } from './FakeLLMProvider';
import { FetchLike } from './http';
import { EnvLike, LLMRuntimeConfig, readLLMRuntimeConfig } from './llmConfig';
import { OmniRouteProvider } from './OmniRouteProvider';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

export type CreateLLMProviderOptions = {
  fetchImpl?: FetchLike;
  fakeHandler?: FakeLLMHandler;
  fakeText?: string;
};

export function createLLMProvider(
  config: LLMRuntimeConfig,
  options: CreateLLMProviderOptions = {}
): LLMProvider {
  switch (config.provider) {
    case 'fake':
      return new FakeLLMProvider({
        text: options.fakeText,
        handler: options.fakeHandler,
        model: config.model
      });
    case 'omniroute':
      return new OmniRouteProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
        fetchImpl: options.fetchImpl
      });
    case 'anthropic':
      return new AnthropicProvider({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
        fetchImpl: options.fetchImpl
      });
    case 'openai':
    case 'xai':
    case 'deepseek':
    case 'openai-compatible':
      return new OpenAICompatibleProvider({
        name: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
        fetchImpl: options.fetchImpl
      });
  }
}

export function createLLMProviderFromEnv(
  env: EnvLike = process.env,
  options: CreateLLMProviderOptions = {}
): LLMProvider {
  return createLLMProvider(readLLMRuntimeConfig(env), options);
}
