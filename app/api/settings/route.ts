import { z } from 'zod';
import {
  getAISettings,
  saveAISettings,
  testConnection,
  validateSettings
} from '../../../src/infrastructure/settings/LLMSettingsService';

export const runtime = 'nodejs';

const SettingsInputSchema = z.object({
  action: z.enum(['get', 'save', 'test']),
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional()
});

export async function GET(): Promise<Response> {
  const settings = getAISettings();
  return Response.json(settings);
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SettingsInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid settings payload' }, { status: 400 });
  }

  switch (parsed.data.action) {
    case 'get': {
      const settings = getAISettings();
      return Response.json(settings);
    }

    case 'save': {
      if (!parsed.data.provider) {
        return Response.json({ error: 'Provider is required.' }, { status: 400 });
      }
      const input = {
        provider: parsed.data.provider,
        model: parsed.data.model ?? '',
        apiKey: parsed.data.apiKey ?? '',
        baseUrl: parsed.data.baseUrl ?? ''
      };
      const validation = validateSettings(input);
      if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 400 });
      }
      try {
        const settings = saveAISettings(input);
        return Response.json(settings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ error: message }, { status: 400 });
      }
    }

    case 'test': {
      if (!parsed.data.provider) {
        return Response.json({ error: 'Provider is required.' }, { status: 400 });
      }
      const input = {
        provider: parsed.data.provider,
        model: parsed.data.model ?? '',
        apiKey: parsed.data.apiKey ?? '',
        baseUrl: parsed.data.baseUrl ?? ''
      };
      const result = await testConnection(input);
      return Response.json(result);
    }

    default:
      return Response.json({ error: 'Unknown action' }, { status: 400 });
  }
}
