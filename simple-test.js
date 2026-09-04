// Simple test to verify the basic structure
console.log('Testing SUTRA domain objects...');

// Import the Account class (we'll need to compile it first or use require)
// For now, let's just verify the files exist
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/domain/accounting/Account.ts',
  'src/domain/events/BusinessEvent.ts',
  'src/domain/policies/Policy.ts',
  'src/domain/policies/PolicyVersion.ts',
  'src/domain/policies/PolicyIR.ts',
  'src/domain/accounting/AccountingTreatment.ts',
  'src/domain/accounting/Journal.ts',
  'src/domain/accounting/JournalLine.ts',
  'src/domain/accounting/AccountingEngine.ts',
  'src/domain/accounting/AccountingEvaluation.ts',
  'src/domain/accounting/PostedJournal.ts',
  'src/domain/accounting/ReversalResult.ts'
];

filesToCheck.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ ${file}`);
  } else {
    console.log(`✗ ${file}`);
  }
});

console.log('\nBasic file structure verification complete.');