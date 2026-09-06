import { z } from 'zod';
import { getEngineSession, resetEngineSession } from '../../../src/application/playground/EngineSession';
import { EngineSnapshot } from '../../../src/application/playground/EngineSnapshot';

export const runtime = 'nodejs';

const EventTypeSchema = z.enum([
  'PURCHASE',
  'REFUND',
  'PAYMENT',
  'USAGE',
  'WALLET_LOAD',
  'WALLET_SPEND',
  'MARKETPLACE_SALE',
  'SELLER_PAYOUT'
]);

const CommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('process'),
    merchant: z.string(),
    amount: z.number(),
    type: EventTypeSchema,
    attributes: z.record(z.unknown()).optional(),
    usage: z.object({
      meter: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      unit: z.string()
    }).optional(),
    category: z.string().optional(),
    mark: z.string().optional(),
    tint: z.string().optional(),
    remember: z.boolean().optional()
  }),
  z.object({
    action: z.literal('addRule'),
    merchant: z.string(),
    name: z.string().optional(),
    debitCode: z.string().optional(),
    creditCode: z.string().optional(),
    minAmount: z.number().optional(),
    type: EventTypeSchema.optional(),
    lines: z.array(z.object({
      side: z.enum(['DEBIT', 'CREDIT']),
      accountCode: z.string(),
      amountType: z.enum(['EVENT_AMOUNT', 'FIXED_AMOUNT', 'ATTRIBUTE_AMOUNT', 'RATE_AMOUNT']),
      value: z.number().optional(),
      currency: z.string().optional(),
      attribute: z.string().optional(),
      rate: z.number().optional(),
      description: z.string().optional()
    })).optional(),
    transactional: z.object({
      participantKind: z.enum(['BUYER', 'SELLER']),
      participantField: z.string(),
      effects: z.array(z.object({
        type: z.enum(['WALLET_LOAD', 'WALLET_SPEND', 'SALE', 'FEE', 'TAX', 'COMMISSION', 'WITHHOLDING', 'ADJUSTMENT', 'PAYOUT']),
        direction: z.enum(['CREDIT', 'DEBIT']),
        amount: z.discriminatedUnion('type', [
          z.object({ type: z.literal('EVENT_AMOUNT') }),
          z.object({ type: z.literal('FIXED'), value: z.number() }),
          z.object({ type: z.literal('RATE'), rate: z.number() })
        ]),
        description: z.string()
      }))
    }).optional()
  }),
  z.object({
    action: z.literal('toggleRule'),
    ruleId: z.string()
  }),
  z.object({
    action: z.literal('reset')
  }),
  z.object({
    action: z.literal('replay'),
    eventId: z.string()
  }),
  z.object({
    action: z.literal('simulate'),
    ruleId: z.string(),
    eventId: z.string().optional()
  }),
  z.object({
    action: z.literal('addCondition'),
    ruleId: z.string(),
    field: z.string(),
    op: z.enum(['=', '!=', '>', '>=', '<', '<=', 'IN']),
    value: z.union([z.string(), z.number(), z.array(z.string())])
  }),
  z.object({
    action: z.literal('addTreatmentLine'),
    ruleId: z.string(),
    side: z.enum(['DEBIT', 'CREDIT']),
    accountCode: z.string(),
    amountType: z.enum(['EVENT_AMOUNT', 'FIXED_AMOUNT', 'ATTRIBUTE_AMOUNT', 'RATE_AMOUNT']).optional()
  }),
  z.object({
    action: z.literal('addAccount'),
    name: z.string(),
    code: z.string(),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
    parentCode: z.string().optional(),
    currency: z.string().optional()
  }),
  z.object({
    action: z.literal('updateAccount'),
    code: z.string(),
    name: z.string().optional(),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']).optional()
  })
]);

export async function GET(): Promise<Response> {
  const session = getEngineSession();
  return Response.json(await session.seedDemo());
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
    return Response.json({ error: 'Unknown engine action' }, { status: 400 });
  }

  const session = getEngineSession();
  let snapshot: EngineSnapshot;
  switch (parsed.data.action) {
    case 'process':
      snapshot = await session.process(parsed.data);
      break;
    case 'addRule':
      snapshot = session.addRule(parsed.data);
      break;
    case 'toggleRule':
      snapshot = session.toggleRule(parsed.data.ruleId);
      break;
    case 'reset':
      snapshot = resetEngineSession().reset();
      snapshot = await getEngineSession().seedDemo();
      break;
    case 'replay':
      snapshot = session.replay(parsed.data.eventId);
      break;
    case 'simulate':
      snapshot = await session.simulate({
        ruleId: parsed.data.ruleId,
        ...(parsed.data.eventId !== undefined ? { eventId: parsed.data.eventId } : {})
      });
      break;
    case 'addCondition':
      snapshot = session.addCondition(parsed.data);
      break;
    case 'addTreatmentLine':
      snapshot = session.addTreatmentLine(parsed.data);
      break;
    case 'addAccount':
      snapshot = session.addAccount(parsed.data);
      break;
    case 'updateAccount':
      snapshot = session.updateAccount(parsed.data);
      break;
  }

  return Response.json(snapshot);
}
