// Tests for policy effective dating

describe('Policy Engine - Effective Dating', () => {
  // Mock function to get applicable policy version for an event date
  const getApplicablePolicyVersion = (eventDate: Date, policyVersions: any[]) => {
    const applicableVersions = policyVersions
      .filter(pv => {
        const effectiveFrom = new Date(pv.effectiveFrom);
        const effectiveTo = pv.effectiveTo ? new Date(pv.effectiveTo) : null;

        return eventDate >= effectiveFrom &&
               (effectiveTo === null || eventDate <= effectiveTo);
      })
      .sort((a, b) => {
        // Sort by version descending (higher version = newer)
        return b.version - a.version;
      });

    return applicableVersions[0] || null; // Return highest version applicable
  };

  const createPolicyVersion = (id: string, version: number, effectiveFrom: string, effectiveTo: string | null) => ({
    id,
    version,
    effectiveFrom: new Date(effectiveFrom),
    effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
    definition: {
      rules: [
        {
          id: 'rule-1',
          priority: 100,
          when: {
            field: 'counterparty',
            operator: 'equals',
            value: 'Starbucks'
          },
          then: {
            treatment: {
              lines: [
                { accountId: 'acc-meals', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                { accountId: 'acc-cash', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
              ]
            }
          }
        }
      ]
    }
  });

  it('should select the correct policy version for a date within range', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-06-30');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-07-01', null);

    const eventDate = new Date('2026-05-15'); // Mid-year

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2]);

    expect(applicable).not.toBeNull();
    expect(applicable?.id).toBe('pv-1'); // Should be v1 for May date
  });

  it('should select the newer policy version for a date after effectiveFrom', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-06-30');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-07-01', null);

    const eventDate = new Date('2026-08-15'); // After v2 starts

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2]);

    expect(applicable).not.toBeNull();
    expect(applicable?.id).toBe('pv-2'); // Should be v2 for August date
  });

  it('should select the older policy version for a date before newer policy starts', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-06-30');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-07-01', null);

    const eventDate = new Date('2026-06-15'); // Still in v1 range

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2]);

    expect(applicable).not.toBeNull();
    expect(applicable?.id).toBe('pv-1'); // Should be v1 for June date
  });

  it('should handle policies with no end date (open-ended)', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-06-30');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-07-01', null); // No end date

    const eventDate = new Date('2026-12-15'); // Well into the future

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2]);

    expect(applicable).not.toBeNull();
    expect(applicable?.id).toBe('pv-2'); // Should be v2 (the open-ended policy)
  });

  it('should return null if no policy version is applicable', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-06-30');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-07-01', '2026-12-31');

    const eventDate = new Date('2025-06-15'); // Before any policy

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2]);

    expect(applicable).toBeNull(); // No applicable policy
  });

  it('should select the highest version when multiple policies apply to same date', () => {
    const policyV1 = createPolicyVersion('pv-1', 1, '2026-01-01', '2026-12-31');
    const policyV2 = createPolicyVersion('pv-2', 2, '2026-01-01', '2026-12-31'); // Same date range
    const policyV3 = createPolicyVersion('pv-3', 3, '2026-01-01', '2026-12-31'); // Same date range

    const eventDate = new Date('2026-06-15'); // Middle of the year

    const applicable = getApplicablePolicyVersion(eventDate, [policyV1, policyV2, policyV3]);

    expect(applicable).not.toBeNull();
    expect(applicable?.id).toBe('pv-3'); // Should be highest version (3)
  });
});