import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { InMemoryPolicyVersionRepository } from '../../src/infrastructure/memory/InMemoryPolicyVersionRepository';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { PolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyVersionStatus } from '../../src/domain/policies/PolicyVersion';

describe('Policy Engine - Effective Dating (Production)', () => {
  let policyEngine: PolicyEngineService;
  let policyVersionRepository: InMemoryPolicyVersionRepository;

  beforeEach(() => {
    policyEngine = new PolicyEngineService();
    policyVersionRepository = new InMemoryPolicyVersionRepository();
  });

  afterEach(() => {
    policyVersionRepository.clear();
  });

  function purchaseRule() {
    return {
      id: id('rule-1'),
      priority: 100,
      when: {
        field: 'eventType' as const,
        operator: 'equals' as const,
        value: 'PURCHASE'
      },
      then: {
        treatment: {
          lines: [
            { accountId: id('acc-meals'), side: 'DEBIT' as const, amount: { type: 'EVENT_AMOUNT' as const } },
            { accountId: id('acc-cash'), side: 'CREDIT' as const, amount: { type: 'EVENT_AMOUNT' as const } }
          ]
        }
      }
    };
  }

  function version(params: {
    id: string;
    version: number;
    effectiveFrom: Date;
    effectiveTo?: Date;
    status?: PolicyVersionStatus;
  }): PolicyVersion {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: params.id,
      policyId: id('pol-dating'),
      version: params.version,
      effectiveFrom: params.effectiveFrom,
      effectiveTo: params.effectiveTo,
      status: params.status ?? 'ACTIVE',
      definition: { rules: [purchaseRule()] }
    });
  }

  function eventOn(occurredAt: Date) {
    return createBusinessEvent({
      id: id('evt-dating'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt,
      amount: 7800,
      currency: 'INR',
      attributes: {}
    });
  }

  describe('InMemoryPolicyVersionRepository.getActivePolicyVersion', () => {
    it('selects the policy version whose date range contains the event date', async () => {
      const policyV1 = version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      });
      const policyV2 = version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-07-01')
      });
      policyVersionRepository.add(policyV1);
      policyVersionRepository.add(policyV2);

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-05-15')
      );

      expect(applicable).not.toBeNull();
      expect(applicable?.id).toBe(id('pv-1'));
    });

    it('selects the newer version after its effectiveFrom', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      }));
      policyVersionRepository.add(version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-07-01')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-08-15')
      );

      expect(applicable?.id).toBe(id('pv-2'));
    });

    it('keeps the older version for a date before the newer policy starts', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      }));
      policyVersionRepository.add(version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-07-01')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-06-15')
      );

      expect(applicable?.id).toBe(id('pv-1'));
    });

    it('treats a missing effectiveTo as open-ended', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      }));
      policyVersionRepository.add(version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-07-01')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-12-15')
      );

      expect(applicable?.id).toBe(id('pv-2'));
    });

    it('returns null when the event date is before every version (future policy relative to the event)', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      }));
      policyVersionRepository.add(version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: new Date('2026-12-31')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2025-06-15')
      );

      expect(applicable).toBeNull();
    });

    it('returns null when the event date is after every version (expired)', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-07-01')
      );

      expect(applicable).toBeNull();
    });

    it('includes the effectiveFrom and effectiveTo boundary dates', async () => {
      const bounded = version({
        id: id('pv-bounded'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-06-30')
      });
      policyVersionRepository.add(bounded);

      const onFrom = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-01-01')
      );
      const onTo = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-06-30')
      );

      expect(onFrom?.id).toBe(id('pv-bounded'));
      expect(onTo?.id).toBe(id('pv-bounded'));
    });

    it('selects the highest version when multiple ACTIVE versions apply to the same date', async () => {
      policyVersionRepository.add(version({
        id: id('pv-1'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31')
      }));
      policyVersionRepository.add(version({
        id: id('pv-2'),
        version: 2,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31')
      }));
      policyVersionRepository.add(version({
        id: id('pv-3'),
        version: 3,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31')
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-06-15')
      );

      expect(applicable?.id).toBe(id('pv-3'));
    });

    it('does not select DRAFT or RETIRED versions even when dates match', async () => {
      policyVersionRepository.add(version({
        id: id('pv-draft'),
        version: 2,
        effectiveFrom: new Date('2026-01-01'),
        status: 'DRAFT'
      }));
      policyVersionRepository.add(version({
        id: id('pv-retired'),
        version: 3,
        effectiveFrom: new Date('2026-01-01'),
        status: 'RETIRED'
      }));
      policyVersionRepository.add(version({
        id: id('pv-active'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE'
      }));

      const applicable = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-06-15')
      );

      expect(applicable?.id).toBe(id('pv-active'));
    });

    it('does not select another tenant ACTIVE version', async () => {
      policyVersionRepository.add(version({
        id: id('pv-shared'),
        version: 1,
        effectiveFrom: new Date('2026-01-01')
      }));

      const forTenantA = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-1'),
        new Date('2026-06-15')
      );
      const forTenantB = await policyVersionRepository.getActivePolicyVersion(
        id('tenant-b'),
        new Date('2026-06-15')
      );

      expect(forTenantA?.id).toBe(id('pv-shared'));
      expect(forTenantB).toBeNull();
    });
  });

  describe('PolicyEngineService.evaluate effective-date logic', () => {
    const effectiveVersion = version({
      id: id('pv-engine'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-06-30')
    });

    it('matches an event whose occurredAt is inside the effective window', () => {
      const result = policyEngine.evaluate(eventOn(new Date('2026-03-15')), effectiveVersion);

      expect(result.matched).toBe(true);
      expect(result.reason).toBe('MATCHED_RULE');
      expect(result.selectedRuleId).toBe(id('rule-1'));
    });

    it('does not match a future event relative to effectiveFrom', () => {
      const result = policyEngine.evaluate(eventOn(new Date('2025-12-31')), effectiveVersion);

      expect(result.matched).toBe(false);
      expect(result.reason).toBe('NO_MATCHING_RULE');
      expect(result.selectedRuleId).toBeNull();
      expect(result.matchedRuleIds).toEqual([]);
    });

    it('does not match an event after effectiveTo (expired)', () => {
      const result = policyEngine.evaluate(eventOn(new Date('2026-07-01')), effectiveVersion);

      expect(result.matched).toBe(false);
      expect(result.reason).toBe('NO_MATCHING_RULE');
      expect(result.selectedRuleId).toBeNull();
    });

    it('includes the effectiveFrom and effectiveTo boundary dates', () => {
      const onFrom = policyEngine.evaluate(eventOn(new Date('2026-01-01')), effectiveVersion);
      const onTo = policyEngine.evaluate(eventOn(new Date('2026-06-30')), effectiveVersion);

      expect(onFrom.matched).toBe(true);
      expect(onTo.matched).toBe(true);
    });

    it('does not execute a DRAFT policy version even if dates match', () => {
      const draft = version({
        id: id('pv-draft-engine'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'DRAFT'
      });

      const result = policyEngine.evaluate(eventOn(new Date('2026-03-15')), draft);

      expect(result.matched).toBe(false);
      expect(result.reason).toBe('POLICY_NOT_ACTIVE');
    });

    it('does not execute a RETIRED policy version even if dates match', () => {
      const retired = version({
        id: id('pv-retired-engine'),
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'RETIRED'
      });

      const result = policyEngine.evaluate(eventOn(new Date('2026-03-15')), retired);

      expect(result.matched).toBe(false);
      expect(result.reason).toBe('POLICY_NOT_ACTIVE');
    });
  });
});
