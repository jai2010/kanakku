import { BusinessEvent } from '../../domain/events/BusinessEvent';
import {
  isAuthoringStatus,
  PolicyLifecycleError,
  transitionPolicyVersion
} from '../../domain/policies/PolicyLifecycle';
import { PolicyValidationResult } from '../../domain/policies/PolicyValidation';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import {
  simulationHasBlockingErrors,
  SimulationResult
} from '../../domain/policies/SimulationResult';
import { AccountingEngineDependencies, AccountingEngineService } from '../accounting/AccountingEngineService';
import { PolicyEngineService } from './PolicyEngineService';

export type PolicyLifecycleDependencies = {
  accountRepository: AccountingEngineDependencies['accountRepository'];
  journalRepository: AccountingEngineDependencies['journalRepository'];
};

export class PolicyLifecycleService {
  private readonly policyEngine: PolicyEngineService;
  private readonly accountingEngine: AccountingEngineService;
  private readonly accountRepository: PolicyLifecycleDependencies['accountRepository'];

  constructor(dependencies: PolicyLifecycleDependencies) {
    this.policyEngine = new PolicyEngineService();
    this.accountRepository = dependencies.accountRepository;
    this.accountingEngine = new AccountingEngineService({
      dependencies: {
        accountRepository: dependencies.accountRepository,
        journalRepository: dependencies.journalRepository
      }
    });
  }

  async validate(
    policyVersion: PolicyVersion,
    tenantId: string
  ): Promise<{ validation: PolicyValidationResult; policyVersion: PolicyVersion }> {
    const validation = await this.policyEngine.validate(policyVersion, {
      tenantId,
      getAccount: (id) => this.accountRepository.getAccount(id)
    });

    if (!validation.valid) {
      return { validation, policyVersion };
    }

    if (isAuthoringStatus(policyVersion.status)) {
      return {
        validation,
        policyVersion: transitionPolicyVersion(policyVersion, 'VALIDATED')
      };
    }

    return { validation, policyVersion };
  }

  async simulate(
    policyVersion: PolicyVersion,
    events: BusinessEvent[]
  ): Promise<SimulationResult> {
    return this.policyEngine.simulate(
      policyVersion,
      events,
      this.accountingEngine
    );
  }

  async completeSimulation(
    policyVersion: PolicyVersion,
    simulation: SimulationResult,
    tenantId: string
  ): Promise<PolicyVersion> {
    this.assertTenant(policyVersion, tenantId);
    if (simulation.policyVersionId !== policyVersion.id) {
      throw new PolicyLifecycleError(
        'Simulation result does not belong to this policy version',
        'SIMULATION_INCOMPLETE'
      );
    }
    if (simulationHasBlockingErrors(simulation)) {
      throw new PolicyLifecycleError(
        'Simulation has unresolved errors',
        'SIMULATION_INCOMPLETE'
      );
    }

    const validation = await this.requireValid(policyVersion, tenantId);
    if (!validation.valid) {
      throw new PolicyLifecycleError(
        'Policy version has unresolved validation errors',
        'VALIDATION_FAILED'
      );
    }

    return transitionPolicyVersion(policyVersion, 'SIMULATED');
  }

  async approve(policyVersion: PolicyVersion, tenantId: string): Promise<PolicyVersion> {
    this.assertTenant(policyVersion, tenantId);
    const validation = await this.requireValid(policyVersion, tenantId);
    if (!validation.valid) {
      throw new PolicyLifecycleError(
        'Policy version has unresolved validation errors',
        'VALIDATION_FAILED'
      );
    }
    if (policyVersion.status === 'RETIRED') {
      throw new PolicyLifecycleError(
        'Invalid policy lifecycle transition RETIRED → APPROVED',
        'INVALID_TRANSITION'
      );
    }
    return transitionPolicyVersion(policyVersion, 'APPROVED');
  }

  async activate(policyVersion: PolicyVersion, tenantId: string): Promise<PolicyVersion> {
    this.assertTenant(policyVersion, tenantId);
    const validation = await this.requireValid(policyVersion, tenantId);
    if (!validation.valid) {
      throw new PolicyLifecycleError(
        'Policy version has unresolved validation errors',
        'VALIDATION_FAILED'
      );
    }
    return transitionPolicyVersion(policyVersion, 'ACTIVE');
  }

  async retire(policyVersion: PolicyVersion, tenantId: string): Promise<PolicyVersion> {
    this.assertTenant(policyVersion, tenantId);
    return transitionPolicyVersion(policyVersion, 'RETIRED');
  }

  private assertTenant(policyVersion: PolicyVersion, tenantId: string): void {
    if (policyVersion.tenantId !== tenantId) {
      throw new PolicyLifecycleError(
        'Policy version tenant does not match requested tenant',
        'TENANT_MISMATCH'
      );
    }
  }

  private async requireValid(
    policyVersion: PolicyVersion,
    tenantId: string
  ): Promise<PolicyValidationResult> {
    return this.policyEngine.validate(policyVersion, {
      tenantId,
      getAccount: (id) => this.accountRepository.getAccount(id)
    });
  }
}
