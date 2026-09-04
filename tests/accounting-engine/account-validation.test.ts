// Tests for accounting engine account validation

import { createAccount } from '../../src/domain/accounting/Account';

// Mock validation functions for account validation
describe('Accounting Engine - Account Validation', () => {
  // Mock function to validate account exists and is active
  const validateAccount = (accountId: string, validAccounts: Map<string, any>) => {
    const account = validAccounts.get(accountId);
    if (!account) {
      return { valid: false, reason: 'ACCOUNT_NOT_FOUND' };
    }

    if (account.status !== 'ACTIVE') {
      return { valid: false, reason: 'ACCOUNT_INACTIVE' };
    }

    return { valid: true, account };
  };

  // Mock function to validate account belongs to tenant
  const validateAccountTenancy = (accountId: string, tenantId: string, validAccounts: Map<string, any>) => {
    const account = validAccounts.get(accountId);
    if (!account) {
      return { valid: false, reason: 'ACCOUNT_NOT_FOUND' };
    }

    if (account.tenantId !== tenantId) {
      return { valid: false, reason: 'ACCOUNT_TENANT_MISMATCH' };
    }

    return { valid: true, account };
  };

  // Mock function to validate account type compatibility with posting side
  const validateAccountType = (accountId: string, side: 'DEBIT' | 'CREDIT', validAccounts: Map<string, any>) => {
    const account = validAccounts.get(accountId);
    if (!account) {
      return { valid: false, reason: 'ACCOUNT_NOT_FOUND' };
    }

    // In real accounting, certain account types should normally have certain sides
    // EXPENSE accounts: normally DEBIT
    // REVENUE accounts: normally CREDIT
    // ASSET accounts: normally DEBIT
    // LIABILITY accounts: normally CREDIT
    // EQUITY accounts: normally CREDIT

    // For this test, we'll just warn about unusual combinations but not reject them
    // as businesses can have valid reasons for unusual postings

    const isUnusual = (
      (account.type === 'EXPENSE' && side === 'CREDIT') ||
      (account.type === 'INCOME' && side === 'DEBIT') ||
      (account.type === 'ASSET' && side === 'CREDIT') ||
      (account.type === 'LIABILITY' && side === 'DEBIT') ||
      (account.type === 'EQUITY' && side === 'DEBIT')
    );

    return {
      valid: true,
      account,
      warning: isUnusual ? 'Unusual account type/side combination' : undefined
    };
  };

  const setupValidAccounts = () => {
    const accounts = new Map<string, any>();

    // Set up some valid accounts
    accounts.set('acc-1000', createAccount({
      id: 'acc-1000',
      tenantId: 'tenant-1',
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));

    accounts.set('acc-2000', createAccount({
      id: 'acc-2000',
      tenantId: 'tenant-1',
      code: '2000',
      name: 'Accounts Payable',
      type: 'LIABILITY',
      status: 'ACTIVE'
    }));

    accounts.set('acc-4000', createAccount({
      id: 'acc-4000',
      tenantId: 'tenant-1',
      code: '4000',
      name: 'Revenue',
      type: 'INCOME',
      status: 'ACTIVE'
    }));

    accounts.set('acc-5000', createAccount({
      id: 'acc-5000',
      tenantId: 'tenant-1',
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    }));

    // Set up an inactive account
    accounts.set('acc-9999', createAccount({
      id: 'acc-9999',
      tenantId: 'tenant-1',
      code: '9999',
      name: 'Old Cash Account',
      type: 'ASSET',
      status: 'INACTIVE'
    }));

    // Set up an account for another tenant
    accounts.set('acc-8888', createAccount({
      id: 'acc-8888',
      tenantId: 'tenant-2', // Different tenant
      code: '8888',
      name: 'Foreign Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    }));

    return accounts;
  };

  it('should validate an existing active account', () => {
    const accounts = setupValidAccounts();
    const result = validateAccount('acc-1000', accounts);

    expect(result.valid).toBe(true);
    expect(result.account.id).toBe('acc-1000');
    expect(result.account.name).toBe('Cash');
  });

  it('should reject a non-existent account', () => {
    const accounts = setupValidAccounts();
    const result = validateAccount('acc-non-existent', accounts);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('ACCOUNT_NOT_FOUND');
  });

  it('should reject an inactive account', () => {
    const accounts = setupValidAccounts();
    const result = validateAccount('acc-9999', accounts);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('ACCOUNT_INACTIVE');
  });

  it('should validate account tenancy for correct tenant', () => {
    const accounts = setupValidAccounts();
    const result = validateAccountTenancy('acc-1000', 'tenant-1', accounts);

    expect(result.valid).toBe(true);
    expect(result.account.id).toBe('acc-1000');
  });

  it('should reject account tenancy for wrong tenant', () => {
    const accounts = setupValidAccounts();
    const result = validateAccountTenancy('acc-8888', 'tenant-1', accounts); // acc-8888 belongs to tenant-2

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('ACCOUNT_TENANT_MISMATCH');
  });

  it('should validate normal account type/side combinations', () => {
    const accounts = setupValidAccounts();

    // EXPENSE account with DEBIT (normal)
    let result = validateAccountType('acc-5000', 'DEBIT', accounts);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();

    // LIABILITY account with CREDIT (normal)
    result = validateAccountType('acc-2000', 'CREDIT', accounts);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();

    // ASSET account with DEBIT (normal)
    result = validateAccountType('acc-1000', 'DEBIT', accounts);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('flag unusual but valid account type/side combinations', () => {
    const accounts = setupValidAccounts();

    // EXPENSE account with CREDIT (unusual but possible, e.g., expense refund)
    let result = validateAccountType('acc-5000', 'CREDIT', accounts);
    expect(result.valid).toBe(true);
    expect(result.warning).toBe('Unusual account type/side combination');

    // REVENUE account with DEBIT (unusual but possible, e.g., sales return)
    result = validateAccountType('acc-4000', 'DEBIT', accounts);
    expect(result.valid).toBe(true);
    expect(result.warning).toBe('Unusual account type/side combination');
  });
});