import { LLMGateway } from '../ai/LLMGateway';
import { LLMProviderError } from '../ai/LLMContract';
import { PolicyDslError } from '../../domain/policies/dsl';
import { PolicyVersion } from '../../domain/policies/PolicyVersion';
import { extractDslFromUntrustedText } from './extractDslText';
import { Kanakku_POLICY_AUTHORING_PROMPT } from './policyAuthoringPrompt';
import { PolicyDslService } from './PolicyDslService';

export type PolicyAuthoringChartAccount = {
  code: string;
  name?: string;
};

export type PolicyAuthoringInput = {
  instruction: string;
  tenantId: string;
  accounts: ReadonlyMap<string, string>;
  chartOfAccounts?: readonly PolicyAuthoringChartAccount[];
  createdAt?: Date;
};

export type PolicyAuthoringResult =
  | {
      status: 'COMPILED';
      instruction: string;
      rawText: string;
      dsl: string;
      provider?: string;
      model?: string;
      policyVersion: PolicyVersion;
    }
  | {
      status: 'REJECTED';
      instruction: string;
      rawText: string;
      dsl: string;
      provider?: string;
      model?: string;
      error: string;
    };

export class PolicyAuthoringService {
  constructor(
    private readonly gateway: LLMGateway,
    private readonly dsl: PolicyDslService = new PolicyDslService()
  ) {}

  async author(input: PolicyAuthoringInput): Promise<PolicyAuthoringResult> {
    let rawText = '';
    let provider: string | undefined;
    let model: string | undefined;

    try {
      const response = await this.gateway.complete({
        systemInstruction: Kanakku_POLICY_AUTHORING_PROMPT,
        userInput: input.instruction,
        context: buildContext(input)
      });
      rawText = response.text;
      provider = response.provider;
      model = response.model;
    } catch (error) {
      const message = error instanceof LLMProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
      return {
        status: 'REJECTED',
        instruction: input.instruction,
        rawText,
        dsl: '',
        provider,
        model,
        error: `LLM provider failed: ${message}`
      };
    }

    const dsl = extractDslFromUntrustedText(rawText);
    try {
      const policyVersion = this.dsl.compile(dsl, {
        tenantId: input.tenantId,
        accounts: input.accounts,
        status: 'AI_GENERATED',
        createdAt: input.createdAt ?? new Date(0)
      });
      return {
        status: 'COMPILED',
        instruction: input.instruction,
        rawText,
        dsl,
        ...(provider !== undefined ? { provider } : {}),
        ...(model !== undefined ? { model } : {}),
        policyVersion
      };
    } catch (error) {
      const message = error instanceof PolicyDslError || error instanceof Error
        ? error.message
        : String(error);
      return {
        status: 'REJECTED',
        instruction: input.instruction,
        rawText,
        dsl,
        ...(provider !== undefined ? { provider } : {}),
        ...(model !== undefined ? { model } : {}),
        error: message
      };
    }
  }
}

function buildContext(input: PolicyAuthoringInput): Record<string, string> | undefined {
  if (input.chartOfAccounts === undefined || input.chartOfAccounts.length === 0) {
    const codes = Array.from(input.accounts.keys());
    if (codes.length === 0) {
      return undefined;
    }
    return { accountCodes: codes.join(', ') };
  }
  return {
    accountCodes: input.chartOfAccounts
      .map((account) => (account.name === undefined ? account.code : `${account.code} (${account.name})`))
      .join(', ')
  };
}
