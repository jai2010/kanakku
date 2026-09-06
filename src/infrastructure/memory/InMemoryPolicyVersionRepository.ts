import { PolicyVersion } from '../../domain/policies/PolicyVersion';

export class InMemoryPolicyVersionRepository {
  private policyVersions: Map<string, PolicyVersion> = new Map();

  async getPolicyVersion(id: string): Promise<PolicyVersion | null> {
    return this.policyVersions.get(id) || null;
  }

  async save(policyVersion: PolicyVersion): Promise<void> {
    this.policyVersions.set(policyVersion.id, policyVersion);
  }

  async getActivePolicyVersion(tenantId: string, eventDate: Date): Promise<PolicyVersion | null> {
    const eventTime = eventDate.getTime();

    const applicableVersions = Array.from(this.policyVersions.values())
      .filter(pv =>
        pv.tenantId === tenantId &&
        pv.status === 'ACTIVE' &&
        eventTime >= pv.effectiveFrom.getTime() &&
        (!pv.effectiveTo || eventTime <= pv.effectiveTo.getTime())
      )
      // Sort by version descending (higher version = newer)
      .sort((a, b) => b.version - a.version);

    return applicableVersions[0] || null;
  }

  async findByPolicyId(policyId: string): Promise<PolicyVersion[]> {
    return Array.from(this.policyVersions.values())
      .filter(pv => pv.policyId === policyId)
      .sort((a, b) => b.version - a.version); // Newest first
  }

  async delete(id: string): Promise<void> {
    this.policyVersions.delete(id);
  }

  // For test setup
  public clear(): void {
    this.policyVersions.clear();
  }

  public add(policyVersion: PolicyVersion): void {
    this.policyVersions.set(policyVersion.id, policyVersion);
  }
}