import { z } from 'zod';
import { AccountingTreatmentSchema } from '../accounting/AccountingTreatment';
import { TreatmentLineSchema } from '../accounting/AccountingTreatment';
import { parseDomain } from '../parse';

// Define the condition operators
export const ConditionOperator = z.enum([
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'in',
  'not_in',
  'exists'
]);

export type ConditionOperator = z.infer<typeof ConditionOperator>;

// Define logical operators
export const LogicalOperator = z.enum([
  'AND',
  'OR',
  'NOT'
]);

export type LogicalOperator = z.infer<typeof LogicalOperator>;

// Define a condition
export const ConditionSchema = z.object({
  field: z.string(),
  operator: ConditionOperator,
  value: z.unknown() // Value can be any type depending on the field
});

export type Condition = z.infer<typeof ConditionSchema>;

export type WhenClause =
  | Condition
  | { AND: WhenClause[] }
  | { OR: WhenClause[] }
  | { NOT: WhenClause };

export const WhenClauseSchema: z.ZodType<WhenClause> = z.lazy(() =>
  z.union([
    ConditionSchema,
    z.object({ AND: z.array(WhenClauseSchema) }).strict(),
    z.object({ OR: z.array(WhenClauseSchema) }).strict(),
    z.object({ NOT: WhenClauseSchema }).strict()
  ])
);

// Define the "then" clause (accounting treatment)
export const ThenClauseSchema = z.object({
  treatment: AccountingTreatmentSchema
});

export type ThenClause = z.infer<typeof ThenClauseSchema>;

// Define a rule
export const RuleSchema = z.object({
  id: z.string().uuid(),
  priority: z.number().int(), // Higher number = higher priority
  when: WhenClauseSchema,
  then: ThenClauseSchema
});

export type Rule = z.infer<typeof RuleSchema>;

// Define the Policy Intermediate Representation
export const PolicyIRSchema = z.object({
  rules: z.array(RuleSchema).min(1) // At least one rule
});

export type PolicyIR = z.infer<typeof PolicyIRSchema>;

export const createPolicyIR = (input: Omit<PolicyIR, 'rules'> & { rules: Rule[] }): PolicyIR => {
  return parseDomain(PolicyIRSchema, {
    rules: input.rules
  }, 'PolicyIR');
};