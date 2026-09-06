# KANAKKU

**Speak English. Kanakku handles the accounting.**

KANAKKU is an experimental programmable accounting system that explores a simple idea:

> People should be able to describe accounting intent in plain English without having to understand all of the machinery underneath.

Tell Kanakku what you want.

Kanakku turns that intent into explicit accounting policy, validates it, lets you simulate it, and then uses a deterministic accounting engine to produce the journal and ledger result.

**Live demo:** https://kanakku1.vercel.app/

---

## The idea

Traditional accounting systems expose users to accounts, journal entries, debit and credit rules, posting logic, and configuration.

Kanakku explores a different interface:

> **Speak English. Kanakku handles the accounting.**

For example:

> "Mark all Starbucks expenses over ₹5,000 as Business Meals."

The request becomes an explicit accounting policy.

That policy can then be:

1. generated
2. inspected
3. validated
4. simulated
5. approved
6. activated
7. executed deterministically

The important distinction is:

**AI translates intent. The accounting engine executes it.**

AI does not directly create or post journal entries.

---

## How it works

```text
Human intent
     ↓
Natural language
     ↓
AI policy authoring
     ↓
Policy DSL
     ↓
Policy IR
     ↓
Validation
     ↓
Simulation
     ↓
Human approval
     ↓
Deterministic Policy Engine
     ↓
Accounting Engine
     ↓
Double-entry validation
     ↓
Ledger
````

The AI layer is therefore an authoring interface, not the accounting system itself.

---

## The product

### Transactions

Where business events enter Kanakku.

Examples include purchases, refunds, and payments.

### Engine

**Watch Accounting Happen.**

A transaction physically moves through the accounting engine as Kanakku:

* resolves applicable policy
* evaluates rules
* resolves accounts
* generates accounting treatment
* validates debit and credit lines
* posts the resulting journal

The engine exists partly to make normally invisible accounting machinery understandable.

### Accounting Studio

Where accounting intent is defined.

Describe what you want in natural language and Kanakku turns it into an explicit policy that can be inspected, validated, simulated, approved, and activated.

### Ledger

Where the accounting result is recorded.

Posted journals use double-entry accounting and must balance before posting.

### Recon

A reconciliation workspace for comparing what happened externally with what Kanakku recorded.

The mental model is:

> What happened?
>
> What did Kanakku record?
>
> Do they match?

Recon is currently a focused prototype rather than a full reconciliation platform.

---

## Architecture

The accounting kernel is intentionally separated from the presentation and infrastructure layers.

```text
src/
  domain/
    events/
    policies/
    accounting/
    ledger/
    accounts/

  application/
    events/
    policies/
    accounting/
    simulation/

  infrastructure/
    database/
    ai/
```

The core accounting domain is designed to remain independent of:

* Next.js
* UI components
* HTTP
* LLM providers
* database implementation

This keeps the accounting logic deterministic and testable.

---

## Core principles

### Configuration over code

Accounting behavior should be expressed through policies and configuration rather than custom code for every business scenario.

### Deterministic execution

AI can help interpret intent, but the execution path is deterministic.

### Human approval

An AI-generated policy is not automatically allowed to affect accounting.

Policies must pass through the appropriate validation, simulation, and approval lifecycle before activation.

### Double-entry integrity

Posted journals must contain valid debit and credit lines and must balance.

### Effective dating

Policies are versioned and can have effective dates so accounting treatment can evolve without rewriting historical policy definitions.

### Auditability

Accounting results retain lineage back to the business event, policy version, rule, and accounting treatment that produced them.

### Fail closed

Invalid accounting treatments should fail rather than silently produce questionable accounting.

---

## Current capabilities

The prototype currently includes:

* Business events
* Chart of accounts
* Accounting policies
* Policy versions
* Human-readable policy DSL
* Policy validation
* Policy simulation
* Policy lifecycle
* Natural-language policy authoring
* Deterministic accounting execution
* Multi-line journal generation
* Double-entry validation
* Ledger posting
* Idempotent processing
* Journal reversal
* Accounting lineage
* Engine visualization
* Reconciliation prototype

This is an experimental prototype, not production accounting software.

---

## Technology

* Next.js
* TypeScript
* React
* Zod
* Provider-neutral LLM integration
* Vercel

The accounting kernel is intentionally separated from these infrastructure choices.

---

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Verify

```bash
npx tsc --noEmit
npm test
npm run build
```

All three should pass.

---

## Project philosophy

Kanakku is an exploration of a simple idea:

> **Accounting can be complicated underneath without being complicated at the interface.**

The interesting part is not an AI that generates journal entries.

The interesting part is a programmable accounting system where humans can express accounting intent naturally, inspect exactly what that intent means, simulate it, approve it, and then let a deterministic engine execute it.

---

## Live demo

**[https://kanakku1.vercel.app/](https://kanakku1.vercel.app/)**