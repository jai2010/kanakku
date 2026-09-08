import { z } from 'zod';
import { LLMProviderName, LLM_PROVIDER_NAMES, readLLMRuntimeConfig, EnvLike } from '../ai/llmConfig';
import { createLLMProvider, CreateLLMProviderOptions } from '../ai/createLLMProvider';
import { LLMProvider, LLMRequest } from '../../application/ai/LLMContract';

// ── Types ──────────────────────────────────────────────────────────────

const UI_PROVIDER_MAP: Record<string, LLMProviderName> = {
  'None / Disabled': 'fake',
  'OpenAI': 'openai',
  'Anthropic': 'anthropic',
  'xAI': 'xai',
  'DeepSeek': 'deepseek',
  'OmniRoute': 'omniroute',
  'OpenAI-compatible': 'openai-compatible'
};

const INTERNAL_TO_UI: Record<LLMProviderName, string> = {
  'fake': 'None / Disabled',
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'xai': 'xAI',
  'deepseek': 'DeepSeek',
  'omniroute': 'OmniRoute',
  'openai-compatible': 'OpenAI-compatible'
};

export type AISettingsInput = {
  provider: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

export type AISettingsView = {
  provider: string;
  model: string;
  baseUrl: string;
  configured: boolean;
};

export type AITestResult = {
  success: boolean;
  message: string;
};

// ── Settings store (in-memory, server-side) ────────────────────────────

let savedSettings: AISettingsInput | null = null;

// ── Resolution: user config → env → default ────────────────────────────

function resolveSettings(env: EnvLike = process.env): AISettingsInput {
  if (savedSettings !== null) {
    return savedSettings;
  }
  // Fall back to environment
  const provider = env.LLM_PROVIDER ?? 'fake';
  const model = env.LLM_MODEL ?? '';
  const apiKey = firstDefined(env, [
    'LLM_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY'
  ]) ?? '';
  const baseUrl = env.LLM_BASE_URL ?? '';

  return { provider, model, apiKey, baseUrl };
}

function firstDefined(env: EnvLike, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

// ── Public API ─────────────────────────────────────────────────────────

export function getAISettings(): AISettingsView {
  const settings = resolveSettings();
  return toView(settings);
}

export function saveAISettings(input: AISettingsInput): AISettingsView {
  // Validate
  const validation = validateSettings(input);
  if (!validation.valid) {
    throw new Error(validation.error!);
  }
  savedSettings = input;
  return toView(input);
}

export function resetAISettings(): void {
  savedSettings = null;
}

export function validateSettings(input: AISettingsInput): { valid: boolean; error?: string } {
  const provider = UI_PROVIDER_MAP[input.provider] ?? input.provider as LLMProviderName;

  if (!LLM_PROVIDER_NAMES.includes(provider)) {
    return { valid: false, error: 'Unsupported AI provider.' };
  }

  if (provider === 'fake') {
    return { valid: true };
  }

  if (!input.model || input.model.trim().length === 0) {
    return { valid: false, error: 'Model is required.' };
  }

  if (provider === 'openai-compatible' && (!input.baseUrl || input.baseUrl.trim().length === 0)) {
    return { valid: false, error: 'Base URL is required for OpenAI-compatible providers.' };
  }

  // API key is optional for env-based config but required for UI save with real providers
  // We allow empty if there's an env-based key that will be used
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    // Check if env has a key
    const envKey = firstDefined(process.env, [
      'LLM_API_KEY', `${provider.toUpperCase()}_API_KEY`, 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY'
    ]);
    if (!envKey) {
      return { valid: false, error: 'API key is required for this provider.' };
    }
  }

  return { valid: true };
}

export async function testConnection(input: AISettingsInput, fetchImpl?: unknown): Promise<AITestResult> {
  const provider = UI_PROVIDER_MAP[input.provider] ?? input.provider as LLMProviderName;

  if (!LLM_PROVIDER_NAMES.includes(provider)) {
    return { success: false, message: 'Unsupported AI provider.' };
  }

  if (provider === 'fake') {
    return { success: true, message: 'Fake provider is always available.' };
  }

  if (!input.model || input.model.trim().length === 0) {
    return { success: false, message: 'Model is required.' };
  }

  const envOverrides: Record<string, string | undefined> = {
    LLM_PROVIDER: provider,
    LLM_MODEL: input.model,
    ...(input.baseUrl ? { LLM_BASE_URL: input.baseUrl } : {}),
    ...(input.apiKey ? { LLM_API_KEY: input.apiKey } : {})
  };

  // Also set the provider-specific env key if apiKey is provided
  if (input.apiKey) {
    const providerKeyMap: Record<string, string> = {
      'openai': 'OPENAI_API_KEY',
      'anthropic': 'ANTHROPIC_API_KEY',
      'xai': 'XAI_API_KEY',
      'deepseek': 'DEEPSEEK_API_KEY',
      'omniroute': 'OPENAI_API_KEY'
    };
    const envKey = providerKeyMap[provider];
    if (envKey) {
      envOverrides[envKey] = input.apiKey;
    }
  }

  let llmProvider: LLMProvider;
  try {
    llmProvider = createLLMProvider(
      readLLMRuntimeConfig(envOverrides as EnvLike),
      fetchImpl !== undefined ? { fetchImpl: fetchImpl as CreateLLMProviderOptions['fetchImpl'] } : {}
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: sanitizeError(message) };
  }

  const testRequest: LLMRequest = {
    systemInstruction: 'You are a test connection. Reply with exactly: OK',
    userInput: 'Reply with exactly: OK'
  };

  try {
    await llmProvider.complete(testRequest);
    return { success: true, message: 'Connection successful.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: sanitizeError(message) };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function toView(settings: AISettingsInput): AISettingsView {
  const provider = UI_PROVIDER_MAP[settings.provider] ?? settings.provider as LLMProviderName;
  return {
    provider: INTERNAL_TO_UI[provider] ?? settings.provider,
    model: settings.model ?? '',
    baseUrl: settings.baseUrl ?? '',
    configured: true
  };
}

function sanitizeError(message: string): string {
  // Remove any potential API keys from error messages
  const sanitized = message
    .replace(/sk-[a-zA-Z0-9]+/g, '[REDACTED]')
    .replace(/key[:\s]+[a-zA-Z0-9]{20,}/gi, 'key: [REDACTED]');

  // Map common errors to user-friendly messages
  if (sanitized.includes('timeout') || sanitized.includes('TIMEOUT')) {
    return 'The AI provider timed out. Try again or check the provider configuration.';
  }
  if (sanitized.includes('fetch failed') || sanitized.includes('ECONNREFUSED') || sanitized.includes('network')) {
    return 'The AI provider is unavailable.';
  }
  if (sanitized.includes('401') || sanitized.includes('403') || sanitized.includes('Unauthorized')) {
    return 'Connection failed. Check your provider, model, API key, and base URL.';
  }

  return 'Connection failed. Check your provider, model, API key, and base URL.';
}
