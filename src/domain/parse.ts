import { z } from 'zod';

export function parseDomain<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`${label} invalid: ${details}`);
  }
  return result.data;
}
