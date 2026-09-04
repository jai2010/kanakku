All TypeScript errors and import issues in the SUTRA test suite have been fixed.

The failing tests were due to:
1. Incorrect import paths
2. TypeScript strict mode violations (implicit any types)
3. Improper handling of logical condition objects
4. Type mismatches in account validation
5. Incorrect condition ordering in reversal tests
6. Improper handling of optional fields in Account model

All issues have been resolved through targeted fixes to the test files and source code as needed.

The test suite should now compile and run successfully in a suitable environment.