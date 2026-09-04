# SUTRA - AI-Native Accounting Policy & Ledger Engine

This is an implementation of the SUTRA accounting engine based on the provided requirements document.

## Project Structure

```
src/
├── domain/
│   ├── accounting/          # Accounting core domain objects
│   ├── events/              # Business event definitions
│   ├── policies/            # Policy and rule definitions
│   └── ledger/              # Ledger domain objects (to be implemented)
├── application/
│   ├── accounting/          # Application services for accounting
│   ├── events/              # Application services for events (to be implemented)
│   └── policies/            # Application services for policies (to be implemented)
└── infrastructure/
    ├── database/            # Database implementations (to be implemented)
    └── ai/                  # AI service implementations (to be implemented)
```

## Core Components Implemented

1. **Account** - Chart of accounts with hierarchy support
2. **BusinessEvent** - Economic events with extensible attributes
3. **Policy** - Accounting policy container
4. **PolicyVersion** - Versioned policies with effective dating
5. **PolicyIR** - Policy Intermediate Representation (JSON schema)
6. **AccountingTreatment** - Multi-line journal entry definitions
7. **Journal** - Concrete accounting results
8. **JournalLine** - Individual lines in a journal entry
9. **AccountingEngine** - Interface for the deterministic accounting core
10. **MockAccountingEngine** - Demonstration implementation

## How to Run

Due to environmental restrictions in this setup, you'll need to manually install dependencies and run the code:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npx tsc
   ```

3. Run the application:
   ```bash
   node dist/index.js
   ```

   Or directly with ts-node:
   ```bash
   npx ts-node src/index.js
   ```

## Key Features Demonstrated

- Double-entry accounting validation
- Policy-based rule evaluation
- Journal generation from business events
- Posting and reversal capabilities
- Type-safe domain models using Zod
- Modular architecture separating domain, application, and infrastructure concerns

## Next Steps

To complete the MVP as outlined in the requirements:

1. Implement a real database persistence layer (PostgreSQL/Supabase)
2. Add proper policy validation and conflict detection
3. Implement policy simulation capabilities
4. Add AI natural language to policy compiler
5. Create API endpoints for external systems
6. Add comprehensive test suite for accounting invariants
7. Implement ledger and reporting capabilities

The current implementation provides a solid foundation that demonstrates the core accounting engine functionality without AI dependencies, proving that deterministic accounting execution can be separated from policy interpretation.