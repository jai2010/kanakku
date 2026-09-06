import { z } from 'zod';
import { getPlaygroundSession } from '../../../src/application/playground/PlaygroundSession';
import { PlaygroundSnapshot } from '../../../src/application/playground/PlaygroundSnapshot';

export const runtime = 'nodejs';

const CommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('author'), instruction: z.string() }),
  z.object({ action: z.literal('replaceDsl'), dsl: z.string() }),
  z.object({ action: z.literal('validate') }),
  z.object({ action: z.literal('simulate') }),
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('activate') }),
  z.object({ action: z.literal('process') }),
  z.object({ action: z.literal('reset') })
]);

export async function GET(): Promise<Response> {
  return Response.json(getPlaygroundSession().snapshot());
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CommandSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: 'Unknown playground action' }, { status: 400 });
  }

  const session = getPlaygroundSession();
  let snapshot: PlaygroundSnapshot;
  switch (parsed.data.action) {
    case 'author':
      snapshot = await session.author(parsed.data.instruction);
      break;
    case 'replaceDsl':
      snapshot = session.replaceDsl(parsed.data.dsl);
      break;
    case 'validate':
      snapshot = await session.validate();
      break;
    case 'simulate':
      snapshot = await session.simulate();
      break;
    case 'approve':
      snapshot = await session.approve();
      break;
    case 'activate':
      snapshot = await session.activate();
      break;
    case 'process':
      snapshot = await session.processEvents();
      break;
    case 'reset':
      snapshot = session.reset();
      break;
  }

  return Response.json(snapshot);
}
