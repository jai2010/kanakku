import { readFileSync } from 'fs';
import { join } from 'path';
import { LLMGateway } from '../../src/application/ai/LLMGateway';
import { PolicyAuthoringService } from '../../src/application/policies/PolicyAuthoringService';
import { createLLMProvider } from '../../src/infrastructure/ai/createLLMProvider';
import { FakeLLMProvider } from '../../src/infrastructure/ai/FakeLLMProvider';
import { OmniRouteProvider } from '../../src/infrastructure/ai/OmniRouteProvider';
import { OpenAICompatibleProvider } from '../../src/infrastructure/ai/OpenAICompatibleProvider';
import { AnthropicProvider } from '../../src/infrastructure/ai/AnthropicProvider';
import { readLLMRuntimeConfig } from '../../src/infrastructure/ai/llmConfig';
import { FetchLike } from '../../src/infrastructure/ai/http';
import { BUSINESS_MEALS_DSL } from '../policy-dsl/fixtures';
import { id } from '../fixtures/ids';

function chatFetch(onRequest: (url: string, body: unknown) => void): FetchLike {
  return async (url, init) => {
    const body: unknown = JSON.parse(init.body);
    onRequest(url, body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: 'ok' } }],
        content: [{ type: 'text', text: 'ok' }]
      })
    };
  };
}

describe('H7.1 provider matrix (configuration only)', () => {
  it('routes each LLM_PROVIDER to the expected adapter class', () => {
    expect(createLLMProvider(readLLMRuntimeConfig({ LLM_PROVIDER: 'fake' })))
      .toBeInstanceOf(FakeLLMProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'omniroute',
      LLM_MODEL: 'auto'
    }))).toBeInstanceOf(OmniRouteProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4o-mini'
    }))).toBeInstanceOf(OpenAICompatibleProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'xai',
      LLM_MODEL: 'grok-4.5'
    }))).toBeInstanceOf(OpenAICompatibleProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'deepseek',
      LLM_MODEL: 'deepseek-chat'
    }))).toBeInstanceOf(OpenAICompatibleProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_MODEL: 'local-model',
      LLM_BASE_URL: 'http://127.0.0.1:8080/v1'
    }))).toBeInstanceOf(OpenAICompatibleProvider);

    expect(createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'anthropic',
      LLM_MODEL: 'claude'
    }))).toBeInstanceOf(AnthropicProvider);
  });

  it('configures OmniRoute model and base URL without code changes', async () => {
    let url = '';
    let body: unknown;
    const config = readLLMRuntimeConfig({
      LLM_PROVIDER: 'omniroute',
      LLM_MODEL: 'deepseek',
      LLM_BASE_URL: 'http://127.0.0.1:9999/v1'
    });
    expect(config.provider).toBe('omniroute');
    expect(config.model).toBe('deepseek');
    expect(config.baseUrl).toBe('http://127.0.0.1:9999/v1');

    const provider = createLLMProvider(config, {
      fetchImpl: chatFetch((requestedUrl, requestedBody) => {
        url = requestedUrl;
        body = requestedBody;
      })
    });
    expect(provider).toBeInstanceOf(OmniRouteProvider);
    await provider.complete({ systemInstruction: 's', userInput: 'u' });
    expect(url).toBe('http://127.0.0.1:9999/v1/chat/completions');
    expect(body).toEqual(expect.objectContaining({ model: 'deepseek' }));
  });

  it('sends openai, xai, deepseek, and openai-compatible traffic to the configured OpenAI-compatible endpoint', async () => {
    const cases = [
      {
        env: { LLM_PROVIDER: 'openai', LLM_MODEL: 'gpt-4o-mini' },
        url: 'https://api.openai.com/v1/chat/completions',
        name: 'openai'
      },
      {
        env: { LLM_PROVIDER: 'xai', LLM_MODEL: 'grok-4.5' },
        url: 'https://api.x.ai/v1/chat/completions',
        name: 'xai'
      },
      {
        env: { LLM_PROVIDER: 'deepseek', LLM_MODEL: 'deepseek-chat' },
        url: 'https://api.deepseek.com/v1/chat/completions',
        name: 'deepseek'
      },
      {
        env: {
          LLM_PROVIDER: 'openai-compatible',
          LLM_MODEL: 'local-model',
          LLM_BASE_URL: 'http://127.0.0.1:8080/v1/'
        },
        url: 'http://127.0.0.1:8080/v1/chat/completions',
        name: 'openai-compatible'
      }
    ];

    for (const testCase of cases) {
      let url = '';
      let body: unknown;
      const provider = createLLMProvider(readLLMRuntimeConfig(testCase.env), {
        fetchImpl: chatFetch((requestedUrl, requestedBody) => {
          url = requestedUrl;
          body = requestedBody;
        })
      });
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
      expect(provider.name).toBe(testCase.name);
      await provider.complete({ systemInstruction: 's', userInput: 'u' });
      expect(url).toBe(testCase.url);
      expect(body).toEqual(expect.objectContaining({ model: testCase.env.LLM_MODEL }));
    }
  });

  it('routes anthropic to AnthropicProvider /messages, not chat/completions', async () => {
    let url = '';
    const provider = createLLMProvider(readLLMRuntimeConfig({
      LLM_PROVIDER: 'anthropic',
      LLM_MODEL: 'claude',
      LLM_BASE_URL: 'https://api.anthropic.com/v1'
    }), {
      fetchImpl: chatFetch((requestedUrl) => {
        url = requestedUrl;
      })
    });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    await provider.complete({ systemInstruction: 's', userInput: 'u' });
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('keeps PolicyAuthoringService provider-agnostic: same DSL from any gateway backend compiles the same', async () => {
    const accounts = new Map([
      ['5220', id('matrix-5220')],
      ['2000', id('matrix-2000')]
    ]);
    const input = {
      instruction: 'meals policy',
      tenantId: id('matrix-tenant'),
      accounts
    };
    const fromFake = await new PolicyAuthoringService(new LLMGateway(new FakeLLMProvider({ text: BUSINESS_MEALS_DSL })))
      .author(input);
    const fromNamedFake = await new PolicyAuthoringService(new LLMGateway(new FakeLLMProvider({
      text: BUSINESS_MEALS_DSL,
      model: 'deepseek'
    }))).author(input);

    expect(fromFake.status).toBe('COMPILED');
    expect(fromNamedFake.status).toBe('COMPILED');
    if (fromFake.status !== 'COMPILED' || fromNamedFake.status !== 'COMPILED') {
      throw new Error('expected compiled policies');
    }
    expect(fromFake.policyVersion.definition).toEqual(fromNamedFake.policyVersion.definition);
  });

  it('does not leak provider SDKs, OmniRoute, or hard-coded models/keys into application or domain', () => {
    const files = [
      'src/application/policies/PolicyAuthoringService.ts',
      'src/application/ai/LLMGateway.ts',
      'src/application/ai/LLMContract.ts',
      'src/application/policies/policyAuthoringPrompt.ts',
      'src/domain/policies/PolicyIR.ts',
      'src/application/accounting/AccountingEngineService.ts'
    ];
    for (const relative of files) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      expect(source).not.toMatch(/omniroute|openai|anthropic|deepseek|sk-|api\.x\.ai|20128/i);
      expect(source).not.toMatch(/from ['"]openai['"]/);
    }
  });
});
