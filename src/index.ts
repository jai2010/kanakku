import { testAccountingEngine } from './tests/accountingEngine.test';

console.log('Starting SUTRA Accounting Engine...');
testAccountingEngine().then(() => {
  console.log('\nSUTRA Accounting Engine initialized successfully!');
}).catch((error) => {
  console.error('\nFailed to initialize SUTRA Accounting Engine:', error);
  process.exit(1);
});