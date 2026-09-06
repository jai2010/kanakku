import { AccountType } from '../accounting/Account';

export type BalanceSide = 'DEBIT' | 'CREDIT';

export function normalBalanceSide(type: AccountType): BalanceSide {
  if (type === 'ASSET' || type === 'EXPENSE') {
    return 'DEBIT';
  }
  return 'CREDIT';
}

/**
 * Signed movement relative to the account's normal balance.
 * Positive increases the normal side; negative is a contra movement.
 */
export function signedDelta(debit: number, credit: number, type: AccountType): number {
  return normalBalanceSide(type) === 'DEBIT' ? debit - credit : credit - debit;
}

export function displayBalance(
  signed: number,
  type: AccountType
): { balance: number; balanceSide: BalanceSide } {
  const normal = normalBalanceSide(type);
  if (signed >= 0) {
    return { balance: signed, balanceSide: normal };
  }
  return {
    balance: -signed,
    balanceSide: normal === 'DEBIT' ? 'CREDIT' : 'DEBIT'
  };
}
