import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import {
  DslPolicy,
  PolicyDslCompileOptions,
  PolicyIrSerializeOptions,
  compilePolicyDsl,
  parsePolicyDsl,
  policyVersionToDsl,
  serializePolicyDsl
} from '../../domain/policies/dsl';

/**
 * Authoring ingress for Kanakku DSL. Compiles to existing PolicyIR; does not execute accounting.
 */
export class PolicyDslService {
  parse(source: string): DslPolicy {
    return parsePolicyDsl(source);
  }

  compile(source: string, options: PolicyDslCompileOptions): PolicyVersion {
    return compilePolicyDsl(source, options);
  }

  serialize(policy: DslPolicy): string {
    return serializePolicyDsl(policy);
  }

  serializePolicyVersion(version: PolicyVersion, options: PolicyIrSerializeOptions): string {
    return serializePolicyDsl(policyVersionToDsl(version, options));
  }
}
