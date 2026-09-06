import { z } from 'zod';
import { parseDomain } from '../parse';

export const ParticipantKind = z.enum(['BUYER', 'SELLER']);
export type ParticipantKind = z.infer<typeof ParticipantKind>;

export const ParticipantAccountStatus = z.enum(['ACTIVE', 'INACTIVE']);
export type ParticipantAccountStatus = z.infer<typeof ParticipantAccountStatus>;

export const ParticipantAccountSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  participantId: z.string().min(1),
  kind: ParticipantKind,
  name: z.string().min(1),
  currency: z.string().length(3),
  status: ParticipantAccountStatus,
  createdAt: z.date()
});

export type ParticipantAccount = z.infer<typeof ParticipantAccountSchema>;

export const createParticipantAccount = (
  input: Omit<ParticipantAccount, 'id' | 'createdAt' | 'status'> & Partial<Pick<ParticipantAccount, 'id' | 'createdAt' | 'status'>>
): ParticipantAccount => {
  return parseDomain(ParticipantAccountSchema, {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    participantId: input.participantId,
    kind: input.kind,
    name: input.name,
    currency: input.currency,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? new Date()
  }, 'ParticipantAccount');
};
