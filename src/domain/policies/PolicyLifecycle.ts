import { PolicyVersion, PolicyVersionStatus, createPolicyVersion } from './PolicyVersion';

export class PolicyLifecycleError extends Error {
  readonly code: 'INVALID_TRANSITION' | 'VALIDATION_FAILED' | 'SIMULATION_INCOMPLETE' | 'TENANT_MISMATCH';

  constructor(
    message: string,
    code: 'INVALID_TRANSITION' | 'VALIDATION_FAILED' | 'SIMULATION_INCOMPLETE' | 'TENANT_MISMATCH'
  ) {
    super(message);
    this.name = 'PolicyLifecycleError';
    this.code = code;
  }
}

const ALLOWED_TRANSITIONS: Record<PolicyVersionStatus, readonly PolicyVersionStatus[]> = {
  AI_GENERATED: ['VALIDATED'],
  DRAFT: ['VALIDATED'],
  VALIDATED: ['SIMULATED'],
  SIMULATED: ['APPROVED'],
  APPROVED: ['ACTIVE'],
  ACTIVE: ['RETIRED'],
  RETIRED: []
};

export function isAllowedPolicyTransition(
  from: PolicyVersionStatus,
  to: PolicyVersionStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionPolicyVersion(
  version: PolicyVersion,
  next: PolicyVersionStatus
): PolicyVersion {
  if (!isAllowedPolicyTransition(version.status, next)) {
    throw new PolicyLifecycleError(
      `Invalid policy lifecycle transition ${version.status} → ${next}`,
      'INVALID_TRANSITION'
    );
  }

  return createPolicyVersion({
    id: version.id,
    policyId: version.policyId,
    tenantId: version.tenantId,
    version: version.version,
    effectiveFrom: version.effectiveFrom,
    effectiveTo: version.effectiveTo,
    status: next,
    definition: version.definition,
    createdAt: version.createdAt
  });
}

export function isAuthoringStatus(status: PolicyVersionStatus): boolean {
  return status === 'DRAFT' || status === 'AI_GENERATED';
}
