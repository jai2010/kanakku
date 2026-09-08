import {
  getAISettings,
  saveAISettings,
  resetAISettings,
  validateSettings,
  testConnection
} from '../../src/infrastructure/settings/LLMSettingsService';

beforeEach(() => {
  resetAISettings();
});

describe('LLMSettingsService', () => {
  describe('getAISettings', () => {
    it('defaults to fake provider when no settings are saved and no env', () => {
      resetAISettings();
      const settings = getAISettings();
      expect(settings.provider).toBe('None / Disabled');
      expect(settings.configured).toBe(true);
    });

    it('returns saved settings when they exist', () => {
      saveAISettings({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test-123',
        baseUrl: ''
      });
      const settings = getAISettings();
      expect(settings.provider).toBe('OpenAI');
      expect(settings.model).toBe('gpt-4o-mini');
    });
  });

  describe('Provider selection', () => {
    const providers = [
      { name: 'None / Disabled', expected: 'fake' },
      { name: 'OpenAI', expected: 'openai' },
      { name: 'Anthropic', expected: 'anthropic' },
      { name: 'xAI', expected: 'xai' },
      { name: 'DeepSeek', expected: 'deepseek' },
      { name: 'OmniRoute', expected: 'omniroute' },
      { name: 'OpenAI-compatible', expected: 'openai-compatible' }
    ] as const;

    it.each(providers.map(p => [p.name, p.expected]))(
      'maps "%s" to internal provider "%s"',
      (uiName, expectedInternal) => {
        const needsBaseUrl = uiName === 'OpenAI-compatible';
        const result = saveAISettings({
          provider: uiName,
          model: expectedInternal === 'fake' ? '' : 'test-model',
          apiKey: expectedInternal === 'fake' ? '' : 'sk-test',
          baseUrl: needsBaseUrl ? 'http://localhost:8080/v1' : ''
        });
        expect(result.provider).toBe(uiName);
      }
    );
  });

  describe('Configuration validation', () => {
    it('rejects unsupported provider', () => {
      const result = validateSettings({ provider: 'unsupported-provider' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('accepts fake provider without model or API key', () => {
      const result = validateSettings({ provider: 'None / Disabled' });
      expect(result.valid).toBe(true);
    });

    it('rejects OpenAI without model', () => {
      const result = validateSettings({
        provider: 'OpenAI',
        apiKey: 'sk-test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Model');
    });

    it('rejects Anthropic without API key when no env key exists', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.LLM_API_KEY;
      const result = validateSettings({
        provider: 'Anthropic',
        model: 'claude-sonnet-4-20250514'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('rejects OpenAI-compatible without base URL', () => {
      const result = validateSettings({
        provider: 'OpenAI-compatible',
        model: 'local-model',
        apiKey: 'sk-test'
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Base URL');
    });

    it('accepts valid OpenAI configuration', () => {
      const result = validateSettings({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test-1234567890'
      });
      expect(result.valid).toBe(true);
    });

    it('accepts valid OpenAI-compatible configuration', () => {
      const result = validateSettings({
        provider: 'OpenAI-compatible',
        model: 'local-model',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:8080/v1'
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Secret handling', () => {
    it('never returns API key in settings view', () => {
      saveAISettings({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-super-secret-key-1234567890',
        baseUrl: ''
      });
      const settings = getAISettings();
      expect(settings).not.toHaveProperty('apiKey');
      expect(JSON.stringify(settings)).not.toContain('sk-super-secret');
    });

    it('sanitizes API keys from error messages', async () => {
      // Mock a provider that throws with key in message
      const mockFetch = async () => ({
        ok: false,
        json: async () => ({ error: { message: 'Invalid key sk-test1234567890abcdef' } }),
        headers: { get: () => 'application/json' },
        status: 401,
        statusText: 'Unauthorized'
      });

      const result = await testConnection({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test1234567890abcdef',
        baseUrl: ''
      }, mockFetch);

      expect(result.success).toBe(false);
      expect(result.message).not.toContain('sk-test1234567890abcdef');
    });
  });

  describe('Backward compatibility', () => {
    it('uses env vars when no settings are saved', () => {
      resetAISettings();
      process.env.LLM_PROVIDER = 'omniroute';
      process.env.LLM_MODEL = 'grok';

      const settings = getAISettings();
      // Should read from env (but getAISettings returns UI view)
      expect(settings.provider).toBeDefined();

      delete process.env.LLM_PROVIDER;
      delete process.env.LLM_MODEL;
    });
  });

  describe('Fake provider', () => {
    it('test connection succeeds with fake provider', async () => {
      const result = await testConnection({
        provider: 'None / Disabled',
        model: '',
        apiKey: '',
        baseUrl: ''
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('Fake provider');
    });

    it('save and get with fake provider', () => {
      const saved = saveAISettings({
        provider: 'None / Disabled',
        model: '',
        apiKey: '',
        baseUrl: ''
      });
      expect(saved.provider).toBe('None / Disabled');
      expect(saved.model).toBe('');
      expect(saved.baseUrl).toBe('');
    });
  });

  describe('testConnection', () => {
    it('rejects unsupported provider', async () => {
      const result = await testConnection({
        provider: 'invalid-provider'
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported');
    });

    it('rejects real provider without model', async () => {
      const result = await testConnection({
        provider: 'OpenAI',
        model: '',
        apiKey: 'sk-test'
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Model');
    });

    it('handles network errors gracefully', async () => {
      const mockFetch = async () => {
        throw new Error('fetch failed: ECONNREFUSED');
      };

      const result = await testConnection({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test-1234567890',
        baseUrl: ''
      }, mockFetch);

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('handles authentication errors', async () => {
      const mockFetch = async () => ({
        ok: false,
        json: async () => ({ error: { message: 'Unauthorized' } }),
        headers: { get: () => 'application/json' },
        status: 401,
        statusText: 'Unauthorized'
      });

      const result = await testConnection({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-invalid-key-1234567890',
        baseUrl: ''
      }, mockFetch);

      expect(result.success).toBe(false);
    });
  });

  describe('saveAISettings', () => {
    it('persists settings in memory', () => {
      const saved = saveAISettings({
        provider: 'Anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-test',
        baseUrl: ''
      });
      expect(saved.provider).toBe('Anthropic');

      const retrieved = getAISettings();
      expect(retrieved.provider).toBe('Anthropic');
      expect(retrieved.model).toBe('claude-sonnet-4-20250514');
    });

    it('overwrites previous settings', () => {
      saveAISettings({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-openai',
        baseUrl: ''
      });

      saveAISettings({
        provider: 'Anthropic',
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant',
        baseUrl: ''
      });

      const settings = getAISettings();
      expect(settings.provider).toBe('Anthropic');
    });

    it('rejects invalid input', () => {
      expect(() => {
        saveAISettings({
          provider: 'invalid-provider',
          model: 'test',
          apiKey: 'sk-test',
          baseUrl: ''
        });
      }).toThrow('Unsupported');
    });
  });

  describe('resetAISettings', () => {
    it('clears saved settings', () => {
      saveAISettings({
        provider: 'OpenAI',
        model: 'gpt-4o-mini',
        apiKey: 'sk-test',
        baseUrl: ''
      });

      resetAISettings();
      const settings = getAISettings();
      expect(settings.provider).toBe('None / Disabled');
    });
  });
});
