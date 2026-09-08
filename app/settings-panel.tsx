'use client';

import { FormEvent, useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

export type SettingsView = {
  provider: string;
  model: string;
  baseUrl: string;
  configured: boolean;
};

export type TestResult = {
  success: boolean;
  message: string;
};

const PROVIDERS = [
  'None / Disabled',
  'OpenAI',
  'Anthropic',
  'xAI',
  'DeepSeek',
  'OmniRoute',
  'OpenAI-compatible'
] as const;

const PROVIDER_PLACEHOLDERS: Record<string, { model: string; baseUrl?: string }> = {
  'OpenAI': { model: 'gpt-4o-mini' },
  'Anthropic': { model: 'claude-sonnet-4-20250514' },
  'xAI': { model: 'grok-4', baseUrl: 'https://api.x.ai/v1' },
  'DeepSeek': { model: 'deepseek-chat' },
  'OmniRoute': { model: 'auto', baseUrl: 'http://127.0.0.1:20128/v1' },
  'OpenAI-compatible': { model: 'local-model', baseUrl: 'http://127.0.0.1:8080/v1' },
  'None / Disabled': { model: '' }
};

const PROVIDER_REQUIRES_BASE_URL = new Set(['OpenAI-compatible', 'xAI', 'OmniRoute']);

// ── Component ──────────────────────────────────────────────────────────

export function SettingsPanel(): JSX.Element {
  const [settings, setSettings] = useState<SettingsView>({
    provider: 'None / Disabled',
    model: '',
    baseUrl: '',
    configured: false
  });
  const [provider, setProvider] = useState('None / Disabled');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySource, setApiKeySource] = useState<'empty' | 'configured'>('empty');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [dirty, setDirty] = useState(false);

  const isRealProvider = provider !== 'None / Disabled';
  const needsBaseUrl = PROVIDER_REQUIRES_BASE_URL.has(provider);
  const placeholder = PROVIDER_PLACEHOLDERS[provider] ?? { model: '' };

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings(): Promise<void> {
    try {
      const response = await fetch('/api/settings?action=get', { method: 'GET' });
      if (!response.ok) return;
      const data: SettingsView = await response.json();
      setSettings(data);
      setProvider(data.provider);
      setModel(data.model);
      setBaseUrl(data.baseUrl);
      // Don't set apiKey from server - it should never be returned
      setApiKeySource(data.configured ? 'configured' : 'empty');
      setDirty(false);
      setTestResult(null);
    } catch {
      // Settings unavailable, use defaults
    }
  }

  function handleProviderChange(value: string): void {
    setProvider(value);
    setDirty(true);
    setTestResult(null);
    // Set default model when switching providers
    const p = PROVIDER_PLACEHOLDERS[value];
    if (p && value !== 'None / Disabled' && model === '') {
      setModel(p.model);
    }
    // Set default base URL for providers that need it
    if (PROVIDER_REQUIRES_BASE_URL.has(value)) {
      setBaseUrl(p?.baseUrl ?? '');
    }
  }

  function handleModelChange(value: string): void {
    setModel(value);
    setDirty(true);
    setTestResult(null);
  }

  function handleApiKeyChange(value: string): void {
    setApiKey(value);
    setDirty(true);
    setTestResult(null);
  }

  function handleBaseUrlChange(value: string): void {
    setBaseUrl(value);
    setDirty(true);
    setTestResult(null);
  }

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!isRealProvider && apiKey === '') {
      // Saving "None / Disabled" is fine
    }
    setSaving(true);
    setToast(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          provider,
          model,
          apiKey: apiKey || undefined,
          baseUrl
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? 'Failed to save settings.');
      } else {
        setSettings(data);
        setToast('AI configuration saved.');
        setDirty(false);
        if (apiKey.length > 0) {
          setApiKeySource('configured');
        }
      }
    } catch {
      setToast('Failed to save settings.');
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function handleTestConnection(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    setToast(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          provider,
          model,
          apiKey: apiKey || undefined,
          baseUrl
        })
      });
      const data: TestResult = await response.json();
      setTestResult(data);
    } catch {
      setTestResult({
        success: false,
        message: 'Connection failed. Check your provider, model, API key, and base URL.'
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <div>
          <h1 className="settings-title">AI / LLM</h1>
          <p className="settings-desc">
            Configure the AI provider used by Accounting Studio to turn natural-language
            accounting policies into policy DSL.
          </p>
          <p className="settings-note">
            The Accounting Engine runs deterministically and does not require an AI provider.
          </p>
        </div>
      </div>

      <form className="settings-form" onSubmit={(e) => void handleSave(e)}>
        {/* Provider */}
        <div className="settings-field">
          <label className="label" htmlFor="settings-provider">Provider</label>
          <select
            id="settings-provider"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        {isRealProvider && (
          <div className="settings-field">
            <label className="label" htmlFor="settings-model">Model</label>
            <input
              id="settings-model"
              type="text"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder={placeholder.model}
              autoComplete="off"
            />
          </div>
        )}

        {/* API Key */}
        {isRealProvider && (
          <div className="settings-field">
            <label className="label" htmlFor="settings-apikey">API Key</label>
            <div className="settings-apikey-row">
              <input
                id="settings-apikey"
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={apiKeySource === 'configured' ? '••••••••••••••••' : 'Enter API key'}
                autoComplete="off"
              />
            </div>
          </div>
        )}

        {/* Base URL */}
        {isRealProvider && needsBaseUrl && (
          <div className="settings-field">
            <label className="label" htmlFor="settings-baseurl">Base URL</label>
            <input
              id="settings-baseurl"
              type="text"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder={placeholder.baseUrl ?? ''}
              autoComplete="off"
            />
          </div>
        )}

        {/* Actions */}
        <div className="settings-actions">
          <button
            type="submit"
            className="btn settings-save-btn"
            disabled={saving || (!dirty && apiKeySource === 'configured')}
          >
            {saving ? 'Saving...' : 'Save configuration'}
          </button>
          {isRealProvider && (
            <button
              type="button"
              className="btn ghost settings-test-btn"
              onClick={() => void handleTestConnection()}
              disabled={testing}
            >
              {testing ? 'Testing...' : 'Test connection'}
            </button>
          )}
        </div>

        {/* Test result */}
        {testResult !== null && (
          <div className={`settings-test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.success ? '✓ ' : '✗ '}{testResult.message}
          </div>
        )}

        {/* Info */}
        <div className="settings-info">
          <p>
            <strong>Self-hosted:</strong> Set provider and API key through <code>.env</code> environment variables.
          </p>
          <p>
            <strong>Hosted:</strong> Use this page to configure the AI provider per deployment.
          </p>
          <p>
            KANAKKU uses an LLM only to translate natural-language accounting policies into policy DSL.
            The Accounting Engine executes the resulting policy deterministically.
          </p>
        </div>
      </form>

      {toast !== null && <div className="toast show">{toast}</div>}
    </div>
  );
}
