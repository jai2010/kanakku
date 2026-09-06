import { createHash } from 'crypto';

export function deterministicDslId(name: string): string {
  const hex = createHash('sha1').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
