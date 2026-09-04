import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { PolicyIR } from '../../src/domain/policies/PolicyIR';
import { Rule } from '../../src/domain/policies/PolicyIR';
import { AccountingTreatment } from '../../src/domain/accounting/AccountingTreatment';
import { TreatmentLine } from '../../src/domain/accounting/AccountingTreatment';
import { AmountExpression } from '../../src/domain/accounting/AccountingTreatment';

describe('PolicyVersion Domain Model', () => {
  const sampleTreatment: AccountingTreatment = {
    lines: [
      {
        accountId: 'acc-1',
        side: 'DEBIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Test debit'
      },
      {
        accountId: 'acc-2',
        side: 'CREDIT' as const,
        amount: { type: 'EVENT_AMOUNT' },
        description: 'Test credit'
      }
    ]
  };

  const sampleRule: Rule = {
    id: 'rule-1',
    priority: 100,
    when: {
      all: [
        { field: 'eventType', operator: 'equals', value: 'PURCHASE' },
        { field: 'counterparty', operator: 'equals', value: 'Starbucks' }
      ]
    },
    then: { treatment: sampleTreatment }
  };

  const samplePolicyIR: PolicyIR = {
    rules: [sampleRule]
  };

  it('should create a valid policy version', () => {
    const policyVersion = createPolicyVersion({
      id: 'pv-1',
      policyId: 'pol-1',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: samplePolicyIR
    });

    expect(policyVersion.id).toBe('pv-1');
    expect(policyVersion.policyId).toBe('pol-1');
    expect(policyVersion.version).toBe(1);
    expect(policyVersion.effectiveFrom.toString()).toBe(new Date('2026-01-01').toString());
    expect(policyVersion.status).toBe('ACTIVE');
    expect(policyVersion.definition).toBe(samplePolicyIR);
  });

  it('should default status to DRAFT', () => {
    const policyVersion = createPolicyVersion({
      id: 'pv-2',
      policyId: 'pol-2',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      definition: samplePolicyIR
      // status not provided
    });

    expect(policyVersion.status).toBe('DRAFT');
  });

  it('should allow effectiveTo to be undefined', () => {
    const policyVersion = createPolicyVersion({
      id: 'pv-3',
      policyId: 'pol-3',
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: undefined,
      status: 'ACTIVE',
      definition: samplePolicyIR
    });

    expect(policyVersion.effectiveTo).toBeUndefined();
  });
});