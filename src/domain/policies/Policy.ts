import { z } from 'zod';
import { parseDomain } from '../parse';

export const PolicyStatus = z.enum([
  'DRAFT',
  'VALIDATED',
  'ACTIVE',
  'RETIRED'
]);

export type PolicyStatus = z.infer<typeof PolicyStatus>;

export const PolicySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),

  name: z.string(),
  description: z.string().optional(),

  createdAt: z.date()
});

export type Policy = z.infer<typeof PolicySchema>;

export const createPolicy = (input: Omit<Policy, 'id' | 'createdAt'> & Partial<Pick<Policy, 'id' | 'createdAt'>>): Policy => {
  return parseDomain(PolicySchema, {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    name: input.name,
    description: input.description,
    createdAt: input.createdAt ?? new Date()
  }, 'Policy');
};