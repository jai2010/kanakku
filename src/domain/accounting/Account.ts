import { z } from 'zod';

export const AccountType = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE'
]);

export type AccountType = z.infer<typeof AccountType>;

export const AccountStatus = z.enum([
  'ACTIVE',
  'INACTIVE'
]);

export type AccountStatus = z.infer<typeof AccountStatus>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),

  code: z.string(),
  name: z.string(),

  type: AccountType,

  parentId: z.string().uuid().optional(),

  currency: z.string().length(3).optional(),

  status: AccountStatus,

  createdAt: z.date()
});

export type Account = z.infer<typeof AccountSchema>;

export const createAccount = (input: Omit<Account, 'id' | 'createdAt' | 'status'> & Partial<Pick<Account, 'id' | 'createdAt' | 'status'>>): Account => {
  return {
    id: input.id ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    code: input.code,
    name: input.name,
    type: input.type,
    parentId: input.parentId,
    currency: input.currency,
    status: input.status ?? 'ACTIVE',
    createdAt: input.createdAt ?? new Date()
  };
};