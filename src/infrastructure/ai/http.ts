import { LLMProviderError } from '../../application/ai/LLMContract';

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export async function postJson(options: {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  fetchImpl: FetchLike;
}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify(options.body),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new LLMProviderError(
        options.provider,
        `${options.provider} HTTP ${response.status}: ${truncate(raw)}`
      );
    }
    try {
      return parseJson(raw);
    } catch {
      throw new LLMProviderError(options.provider, `${options.provider} returned non-JSON`);
    }
  } catch (error) {
    if (error instanceof LLMProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LLMProviderError(options.provider, `${options.provider} request timed out`);
    }
    throw new LLMProviderError(
      options.provider,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    clearTimeout(timer);
  }
}

export function resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl !== undefined) {
    return fetchImpl;
  }
  if (typeof fetch !== 'function') {
    throw new LLMProviderError('http', 'fetch is not available');
  }
  return async (input, init) => {
    const response = await fetch(input, init);
    return {
      ok: response.ok,
      status: response.status,
      text: () => response.text()
    };
  };
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}

function truncate(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= 200) {
    return compact;
  }
  return `${compact.slice(0, 200)}...`;
}
