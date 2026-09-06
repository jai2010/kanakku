import { Policy } from '../../domain/policies/Policy';

export class InMemoryPolicyRepository {
  private policies: Map<string, Policy> = new Map();

  async getPolicy(id: string): Promise<Policy | null> {
    return this.policies.get(id) || null;
  }

  async save(policy: Policy): Promise<void> {
    this.policies.set(policy.id, policy);
  }

  async findByTenantId(tenantId: string): Promise<Policy[]> {
    return Array.from(this.policies.values()).filter(
      policy => policy.tenantId === tenantId
    );
  }

  async delete(id: string): Promise<void> {
    this.policies.delete(id);
  }

  // For test setup
  public clear(): void {
    this.policies.clear();
  }

  public add(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }
}