import { z } from 'zod';
import { PolicyVersion } from '../policies/PolicyVersion';
import { Rule } from '../policies/PolicyIR';

export const EvaluationReason = z.enum([
  'MATCHED_RULE',
  'NO_MATCHING_RULE',
  'POLICY_NOT_FOUND',
  'POLICY_NOT_ACTIVE',
  'AMOUNT_INVALID',
  'ACCOUNT_INVALID'
]);

export type EvaluationReason = z.infer<typeof EvaluationReason>;

export const AccountingEvaluationSchema = z.object({
  matched: z.boolean(),
  policyVersionId: z.string().uuid().optional(),
  matchedRuleIds: z.array(z.string().uuid()),
  selectedRuleId: z.string().uuid().optional(),
  reason: EvaluationReason
});

export type AccountingEvaluation = z.infer<typeof AccountingEvaluationSchema>;

export const createAccountingEvaluation = (input: Omit<AccountingEvaluation, 'matchedRuleIds'> & { matchedRuleIds: string[] }): AccountingEvaluation => {
  return {
    matched: input.matched,
    policyVersionId: input.policyVersionId,
    matchedRuleIds: input.matchedRuleIds,
    selectedRuleId: input.selectedRuleId,
    reason: input.reason
  };
};