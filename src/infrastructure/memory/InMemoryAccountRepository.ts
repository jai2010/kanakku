import { Account } from '../../domain/accounting/Account';

export class InMemoryAccountRepository {
  private accounts: Map<string, Account> = new Map();

  async getAccount(id: string): Promise<Account | null> {
    return this.accounts.get(id) || null;
  }

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
  }

  async findByTenantId(tenantId: string): Promise<Account[]> {
    return Array.from(this.accounts.values()).filter(
      account => account.tenantId === tenantId
    );
  }

  async delete(id: string): Promise<void> {
    this.accounts.delete(id);
  }

  // For test setup
  public clear(): void {
    this.accounts.clear();
  }

  public add(account: Account): void {
    this.accounts.set(account.id, account);
  }
}