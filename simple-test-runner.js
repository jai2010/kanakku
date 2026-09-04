// Simple test runner for SUTRA - bypassing Jest due to environment issues

console.log('=== SUTRA SIMPLE TEST RUNNER ===\n');

// Test 1: Basic Account Creation
try {
    const { createAccount } = require('./src/domain/accounting/Account');
    const account = createAccount({
        id: 'test-acc-id',
        tenantId: 'test-tenant-id',
        code: '1000',
        name: 'Test Cash Account',
        type: 'ASSET',
        status: 'ACTIVE'
    });

    console.log('✓ Account creation test passed');
    console.log(`  Account ID: ${account.id}`);
    console.log(`  Account Code: ${account.code}`);
    console.log(`  Account Type: ${account.type}`);
} catch (error) {
    console.log('✗ Account creation test failed:', error.message);
}

// Test 2: Business Event Creation
try {
    const { createBusinessEvent } = require('./src/domain/events/BusinessEvent');
    const event = createBusinessEvent({
        id: 'test-event-id',
        tenantId: 'test-tenant-id',
        eventType: 'PURCHASE',
        occurredAt: new Date('2026-09-03'),
        amount: 1500,
        currency: 'USD',
        counterparty: 'Test Vendor',
        attributes: { test: 'value' }
    });

    console.log('✓ BusinessEvent creation test passed');
    console.log(`  Event ID: ${event.id}`);
    console.log(`  Event Type: ${event.eventType}`);
    console.log(`  Event Amount: ${event.amount} ${event.currency}`);
} catch (error) {
    console.log('✗ BusinessEvent creation test failed:', error.message);
}

// Test 3: Policy Creation
try {
    const { createPolicy } = require('./src/domain/policies/Policy');
    const policy = createPolicy({
        id: 'test-policy-id',
        tenantId: 'test-tenant-id',
        name: 'Test Policy',
        description: 'A test policy for validation'
    });

    console.log('✓ Policy creation test passed');
    console.log(`  Policy ID: ${policy.id}`);
    console.log(`  Policy Name: ${policy.name}`);
} catch (error) {
    console.log('✗ Policy creation test failed:', error.message);
}

// Test 4: PolicyVersion Creation
try {
    const { createPolicyVersion } = require('./src/domain/policies/PolicyVersion');
    const policyVersion = createPolicyVersion({
        id: 'test-pv-id',
        policyId: 'test-policy-id',
        version: 1,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
        definition: {
            rules: [
                {
                    id: 'test-rule-id',
                    priority: 100,
                    when: {
                        field: 'eventType',
                        operator: 'equals',
                        value: 'PURCHASE'
                    },
                    then: {
                        treatment: {
                            lines: [
                                { accountId: 'acc-1', side: 'DEBIT', amount: { type: 'EVENT_AMOUNT' } },
                                { accountId: 'acc-2', side: 'CREDIT', amount: { type: 'EVENT_AMOUNT' } }
                            ]
                        }
                    }
                }
            ]
        }
    });

    console.log('✓ PolicyVersion creation test passed');
    console.log(`  PolicyVersion ID: ${policyVersion.id}`);
    console.log(`  PolicyVersion Version: ${policyVersion.version}`);
    console.log(`  PolicyVersion Status: ${policyVersion.status}`);
} catch (error) {
    console.log('✗ PolicyVersion creation test failed:', error.message);
}

// Test 5: Journal Creation Validation
try {
    const { createJournalLine } = require('./src/domain/accounting/JournalLine');

    // Test valid journal line (debit)
    const debitLine = createJournalLine({
        journalId: 'test-journal-id',
        accountId: 'acc-1',
        debit: 1000,
        credit: 0,
        currency: 'USD'
    });

    // Test valid journal line (credit)
    const creditLine = createJournalLine({
        journalId: 'test-journal-id',
        accountId: 'acc-2',
        debit: 0,
        credit: 1000,
        currency: 'USD'
    });

    console.log('✓ JournalLine creation test passed');
    console.log(`  Debit Line: Dr ${debitLine.debit}, Cr ${debitLine.credit}`);
    console.log(`  Credit Line: Dr ${creditLine.debit}, Cr ${creditLine.credit}`);
} catch (error) {
    console.log('✗ JournalLine creation test failed:', error.message);
}

// Test 6: Test Invalid JournalLine (both debit and credit > 0)
try {
    const { createJournalLine } = require('./src/domain/accounting/JournalLine');
    const invalidLine = createJournalLine({
        journalId: 'test-journal-id',
        accountId: 'acc-1',
        debit: 500,
        credit: 300,  // This should fail validation
        currency: 'USD'
    });
    console.log('✗ Invalid JournalLine test failed - should have thrown an error');
} catch (error) {
    console.log('✓ Invalid JournalLine correctly rejected:', error.message);
}

// Test 7: Test Invalid JournalLine (both debit and credit = 0)
try {
    const { createJournalLine } = require('./src/domain/accounting/JournalLine');
    const invalidLine = createJournalLine({
        journalId: 'test-journal-id',
        accountId: 'acc-1',
        debit: 0,
        credit: 0,  // This should fail validation
        currency: 'USD'
    });
    console.log('✗ Invalid JournalLine (zero) test failed - should have thrown an error');
} catch (error) {
    console.log('✓ Invalid JournalLine (zero) correctly rejected:', error.message);
}

// Test 8: Accounting Treatment
try {
    const { createAccountingTreatment } = require('./src/domain/accounting/AccountingTreatment');
    const treatment = createAccountingTreatment({
        lines: [
            {
                accountId: 'acc-1',
                side: 'DEBIT',
                amount: { type: 'EVENT_AMOUNT' },
                description: 'Test debit line'
            },
            {
                accountId: 'acc-2',
                side: 'CREDIT',
                amount: { type: 'EVENT_AMOUNT' },
                description: 'Test credit line'
            }
        ]
    });

    console.log('✓ AccountingTreatment creation test passed');
    console.log(`  Treatment lines: ${treatment.lines.length}`);
    console.log(`  Line 1: ${treatment.lines[0].accountId} ${treatment.lines[0].side}`);
    console.log(`  Line 2: ${treatment.lines[1].accountId} ${treatment.lines[1].side}`);
} catch (error) {
    console.log('✗ AccountingTreatment creation test failed:', error.message);
}

// Test 9: Test Invalid AccountingTreatment (too few lines)
try {
    const { createAccountingTreatment } = require('./src/domain/accounting/AccountingTreatment');
    const invalidTreatment = createAccountingTreatment({
        lines: [
            {
                accountId: 'acc-1',
                side: 'DEBIT',
                amount: { type: 'EVENT_AMOUNT' },
                description: 'Single line treatment'
            }
        ]
    });
    console.log('✗ Invalid AccountingTreatment test failed - should have thrown an error');
} catch (error) {
    console.log('✓ Invalid AccountingTreatment correctly rejected:', error.message);
}

console.log('\n=== SIMPLE TEST RUNNER COMPLETE ===');