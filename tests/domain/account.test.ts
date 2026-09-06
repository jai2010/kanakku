import { id } from '../fixtures/ids';
import { createAccount } from '../../src/domain/accounting/Account';

describe('Account Domain Model', () => {
  it('should create a valid asset account', () => {
    const account = createAccount({
      id: id('acc-1'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET',
      status: 'ACTIVE'
    });

    expect(account.id).toBe(id('acc-1'));
    expect(account.tenantId).toBe(id('tenant-1'));
    expect(account.code).toBe('1000');
    expect(account.name).toBe('Cash');
    expect(account.type).toBe('ASSET');
    expect(account.status).toBe('ACTIVE');
  });

  it('should create an account with hierarchy', () => {
    const parentAccount = createAccount({
      id: id('acc-parent'),
      tenantId: id('tenant-1'),
      code: '5000',
      name: 'Expenses',
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    const childAccount = createAccount({
      id: id('acc-child'),
      tenantId: id('tenant-1'),
      code: '5200',
      name: 'Dining Expense',
      parentId: id('acc-parent'),
      type: 'EXPENSE',
      status: 'ACTIVE'
    });

    expect(childAccount.parentId).toBe(id('acc-parent'));
  });

  it('should default status to ACTIVE', () => {
    const account = createAccount({
      id: id('acc-1'),
      tenantId: id('tenant-1'),
      code: '1000',
      name: 'Cash',
      type: 'ASSET'
      // status not provided
    });

    expect(account.status).toBe('ACTIVE');
  });
});