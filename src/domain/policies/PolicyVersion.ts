import { z } from 'zod';
import { PolicyIRSchema } from './PolicyIR';

export const PolicyVersionStatus = z.enum([
  'DRAFT',
  'VALIDATED',
  'ACTIVE',
  'RETIRED'
]);

export type PolicyVersionStatus = z.infer<typeof PolicyVersionStatus>;

export const PolicyVersionSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),

  version: z.number().int().positive(),

  effectiveFrom: z.date(),
  effectiveTo: z.date().optional(),

  status: PolicyVersionStatus,

  definition: PolicyIRSchema,

  createdAt: z.date()
});

export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export const createPolicyVersion = (input: Omit<PolicyVersion, 'id' | 'createdAt' | 'status'> & Partial<Pick<PolicyVersion, 'id' | 'createdAt' | 'status'>>): PolicyVersion => {
  return {
    id: input.id ?? crypto.randomUUID(),
    policyId: input.policyId,
    version: input.version,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    status: input.status ?? 'DRAFT',
    definition: input.definition,
    createdAt: input.createdAt ?? new Date()
  };
};