import { z } from 'zod';
import { PolicyIRSchema } from './PolicyIR';
import { parseDomain } from '../parse';

export const PolicyVersionStatus = z.enum([
  'AI_GENERATED',
  'DRAFT',
  'VALIDATED',
  'SIMULATED',
  'APPROVED',
  'ACTIVE',
  'RETIRED'
]);

export type PolicyVersionStatus = z.infer<typeof PolicyVersionStatus>;

export const PolicyVersionSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  tenantId: z.string().uuid(),

  version: z.number().int().positive(),

  effectiveFrom: z.date(),
  effectiveTo: z.date().optional(),

  status: PolicyVersionStatus,

  definition: PolicyIRSchema,

  createdAt: z.date()
});

export type PolicyVersion = z.infer<typeof PolicyVersionSchema>;

export const createPolicyVersion = (input: Omit<PolicyVersion, 'id' | 'createdAt' | 'status'> & Partial<Pick<PolicyVersion, 'id' | 'createdAt' | 'status'>>): PolicyVersion => {
  return parseDomain(PolicyVersionSchema, {
    id: input.id ?? crypto.randomUUID(),
    policyId: input.policyId,
    tenantId: input.tenantId,
    version: input.version,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    status: input.status ?? 'DRAFT',
    definition: input.definition,
    createdAt: input.createdAt ?? new Date()
  }, 'PolicyVersion');
};