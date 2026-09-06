import { id } from '../fixtures/ids';
import { createPolicy } from '../../src/domain/policies/Policy';

describe('Policy Domain Model', () => {
  it('should create a valid policy', () => {
    const policy = createPolicy({
      id: id('pol-1'),
      tenantId: id('tenant-1'),
      name: 'Starbucks Classification',
      description: 'Policy for classifying Starbucks transactions'
    });

    expect(policy.id).toBe(id('pol-1'));
    expect(policy.tenantId).toBe(id('tenant-1'));
    expect(policy.name).toBe('Starbucks Classification');
    expect(policy.description).toBe('Policy for classifying Starbucks transactions');
  });

  it('should create a policy without description', () => {
    const policy = createPolicy({
      id: id('pol-2'),
      tenantId: id('tenant-1'),
      name: 'Simple Policy'
      // description not provided
    });

    expect(policy.description).toBeUndefined();
  });
});