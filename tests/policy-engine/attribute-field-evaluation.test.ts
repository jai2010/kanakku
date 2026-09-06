import { id } from '../fixtures/ids';
import { PolicyEngineService } from '../../src/application/policies/PolicyEngineService';
import { createPolicyVersion } from '../../src/domain/policies/PolicyVersion';
import { createBusinessEvent } from '../../src/domain/events/BusinessEvent';
import { BusinessEvent } from '../../src/domain/events/BusinessEvent';
import { WhenClause } from '../../src/domain/policies/PolicyIR';

describe('Policy Engine — EVENT_ATTRIBUTE field evaluation', () => {
  let policyEngine: PolicyEngineService;

  beforeEach(() => {
    policyEngine = new PolicyEngineService();
  });

  function eventWithAttributes(attributes: BusinessEvent['attributes']): BusinessEvent {
    return createBusinessEvent({
      id: id('evt-attr-eval'),
      tenantId: id('tenant-1'),
      eventType: 'PURCHASE',
      occurredAt: new Date('2026-09-03'),
      amount: 8200,
      currency: 'INR',
      counterparty: 'Supplier ABC',
      attributes,
      source: 'API'
    });
  }

  function policyWithWhen(when: WhenClause) {
    return createPolicyVersion({
      tenantId: id('tenant-1'),
      id: id('pv-attr-eval'),
      policyId: id('pol-attr-eval'),
      version: 1,
      effectiveFrom: new Date('2026-01-01'),
      status: 'ACTIVE',
      definition: {
        rules: [
          {
            id: id('rule-attr'),
            priority: 100,
            when,
            then: {
              treatment: {
                lines: [
                  { accountId: id('acc-expense'), side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                  { accountId: id('acc-payable'), side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                ]
              }
            }
          }
        ]
      }
    });
  }

  it('matches attributes.hasTax equals true', () => {
    const result = policyEngine.evaluate(
      eventWithAttributes({ hasTax: true }),
      policyWithWhen({ field: 'attributes.hasTax', operator: 'equals', value: true })
    );

    expect(result.matched).toBe(true);
    expect(result.selectedRuleId).toBe(id('rule-attr'));
  });

  it('does not match attributes.hasTax equals true when the value is false', () => {
    const result = policyEngine.evaluate(
      eventWithAttributes({ hasTax: false }),
      policyWithWhen({ field: 'attributes.hasTax', operator: 'equals', value: true })
    );

    expect(result.matched).toBe(false);
    expect(result.selectedRuleId).toBeNull();
  });

  it('does not match attributes.hasTax equals true when the value is null', () => {
    const result = policyEngine.evaluate(
      eventWithAttributes({ hasTax: null }),
      policyWithWhen({ field: 'attributes.hasTax', operator: 'equals', value: true })
    );

    expect(result.matched).toBe(false);
    expect(result.selectedRuleId).toBeNull();
  });

  it('does not match when the attribute is absent', () => {
    const result = policyEngine.evaluate(
      eventWithAttributes({}),
      policyWithWhen({ field: 'attributes.hasTax', operator: 'equals', value: true })
    );

    expect(result.matched).toBe(false);
    expect(result.selectedRuleId).toBeNull();
  });
});
