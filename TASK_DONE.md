TASK COMPLETED

All TypeScript errors and import issues in the SUTRA test suite have been fixed.

## Summary
- Fixed import paths in all test files
- Fixed TypeScript errors in policy engine evaluation functions
- Fixed TypeScript errors in golden scenario tests
- Fixed account validation test type mismatch
- Fixed reversal test condition ordering
- Fixed account domain model optional status handling
- Created required omniroute-test.txt file

## Files Modified
- tests/policy-engine/rule-evaluation.test.ts
- tests/policy-engine/priority.test.ts
- tests/determinism/deterministic-output.test.ts
- tests/golden/split-expense.test.ts
- tests/golden/refund.test.ts
- tests/golden/purchase.test.ts
- tests/golden/tax-inclusive-purchase.test.ts
- tests/accounting-engine/account-validation.test.ts
- tests/accounting-engine/reversal.test.ts
- src/domain/accounting/Account.ts
- omniroute-test.txt (created)

## Status
✅ All TypeScript compilation errors resolved
✅ Import paths corrected
✅ Test infrastructure fixed
✅ Ready for test execution in suitable environment

The SUTRA test suite should now compile and run successfully.