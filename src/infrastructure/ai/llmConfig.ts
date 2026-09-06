export const LLM_PROVIDER_NAMES = [
  'omniroute',
  'openai',
  'anthropic',
  'xai',
  'deepseek',
  'openai-compatible',
  'fake'
] as const;

export type LLMProviderName = (typeof LLM_PROVIDER_NAMES)[number];

export type LLMRuntimeConfig = {
  provider: LLMProviderName;
  model: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
};

export type EnvLike = {
  readonly [key: string]: string | undefined;
};

const DEFAULT_BASE_URLS: Record<Exclude<LLMProviderName, 'fake' | 'openai-compatible'>, string> = {
  omniroute: 'http://127.0.0.1:20128/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1'
};

const DEFAULT_MODELS: Partial<Record<LLMProviderName, string>> = {
  omniroute: 'auto',
  fake: 'fake'
};

export function readLLMRuntimeConfig(env: EnvLike = process.env): LLMRuntimeConfig {
  const provider = parseProvider(env.LLM_PROVIDER ?? 'fake');
  const model = env.LLM_MODEL ?? DEFAULT_MODELS[provider];
  if (model === undefined || model.length === 0) {
    throw new Error(`LLM_MODEL is required for provider ${provider}`);
  }

  const baseUrl = resolveBaseUrl(provider, env.LLM_BASE_URL);
  const apiKey = firstDefined(env, [
    'LLM_API_KEY',
    'OMNIROUTE_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'XAI_API_KEY',
    'DEEPSEEK_API_KEY'
  ]);
  const timeoutMs = parseTimeout(env.LLM_TIMEOUT_MS);

  return {
    provider,
    model,
    baseUrl,
    ...(apiKey !== undefined ? { apiKey } : {}),
    timeoutMs
  };
}

function parseProvider(value: string): LLMProviderName {
  const normalized = value.trim().toLowerCase();
  for (const name of LLM_PROVIDER_NAMES) {
    if (name === normalized) {
      return name;
    }
  }
  throw new Error(`Unknown LLM_PROVIDER ${JSON.stringify(value)}`);
}

function resolveBaseUrl(provider: LLMProviderName, configured?: string): string {
  if (configured !== undefined && configured.length > 0) {
    return stripTrailingSlash(configured);
  }
  if (provider === 'fake') {
    return '';
  }
  if (provider === 'openai-compatible') {
    throw new Error('LLM_BASE_URL is required for provider openai-compatible');
  }
  return DEFAULT_BASE_URLS[provider];
}

function parseTimeout(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    return 30000;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('LLM_TIMEOUT_MS must be a positive number');
  }
  return parsed;
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

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
