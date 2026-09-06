import { z } from 'zod';
import { AccountingTreatmentSchema } from '../accounting/AccountingTreatment';
import { parseDomain } from '../parse';
import { PolicyVersionStatus } from './PolicyVersion';

export const SimulationReason = z.enum([
  'MATCHED_RULE',
  'NO_MATCHING_RULE',
  'POLICY_INVALID_CONFLICTING_RULES',
  'POLICY_NOT_ACTIVE',
  'POLICY_NOT_FOUND',
  'JOURNAL_INVALID',
  'JOURNAL_GENERATION_FAILED'
]);

export type SimulationReason = z.infer<typeof SimulationReason>;

export const SimulationLinePreviewSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number(),
  credit: z.number(),
  currency: z.string(),
  description: z.string()
});

export type SimulationLinePreview = z.infer<typeof SimulationLinePreviewSchema>;

export const SimulationJournalPreviewSchema = z.object({
  lines: z.array(SimulationLinePreviewSchema),
  totalDebits: z.number(),
  totalCredits: z.number(),
  balanced: z.boolean()
});

export type SimulationJournalPreview = z.infer<typeof SimulationJournalPreviewSchema>;

export const SimulatedEventResultSchema = z.object({
  eventId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  matched: z.boolean(),
  reason: SimulationReason,
  selectedRuleId: z.string().uuid().nullable(),
  matchedRuleIds: z.array(z.string().uuid()),
  treatment: AccountingTreatmentSchema.optional(),
  journalPreview: SimulationJournalPreviewSchema.optional(),
  wouldPost: z.boolean(),
  validationReason: z.string().optional(),
  error: z.string().optional()
});

export type SimulatedEventResult = z.infer<typeof SimulatedEventResultSchema>;

export const SimulationResultSchema = z.object({
  policyVersionId: z.string().uuid(),
  policyStatus: PolicyVersionStatus,
  events: z.array(SimulatedEventResultSchema)
});

export type SimulationResult = z.infer<typeof SimulationResultSchema>;

export function createSimulationResult(input: SimulationResult): SimulationResult {
  return parseDomain(SimulationResultSchema, input, 'SimulationResult');
}

export function simulationHasBlockingErrors(result: SimulationResult): boolean {
  if (result.events.length === 0) {
    return true;
  }
  return result.events.some((eventResult) =>
    eventResult.reason === 'POLICY_INVALID_CONFLICTING_RULES' ||
    eventResult.reason === 'JOURNAL_INVALID' ||
    eventResult.reason === 'JOURNAL_GENERATION_FAILED' ||
    eventResult.reason === 'POLICY_NOT_FOUND'
  );
}
