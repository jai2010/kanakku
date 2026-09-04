import { z } from 'zod';
import { AccountingTreatmentSchema } from '../accounting/AccountingTreatment';
import { TreatmentLineSchema } from '../accounting/AccountingTreatment';

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

// Forward declaration for recursive type
interface WhenClauseObject {}

// Define the "when" clause (can be a single condition or a group with logical operators)
// We use z.lazy() to handle the recursive type reference with proper typing
export const WhenClauseSchema: z.ZodType<WhenClauseObject> = z.lazy(() =>
  z.union([
    ConditionSchema, // Single condition
    z.object({
      // For logical grouping
      [LogicalOperator.enum.AND]: z.array(WhenClauseSchema),
      [LogicalOperator.enum.OR]: z.array(WhenClauseSchema),
      [LogicalOperator.enum.NOT]: WhenClauseSchema
    })
  ])
);

// Define the WhenClause type
export type WhenClause = z.infer<typeof WhenClauseSchema>;

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
  return {
    rules: input.rules
  };
};