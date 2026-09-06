# Architecture

Kanakku is a **deterministic accounting kernel** with a **playground UI**.

The kernel decides what to post. The UI lets you watch it, teach it, inspect the books, and reconcile.

```
TRANSACTIONS          What happened?
      ↓
ENGINE                How does Kanakku account for it?
      ↓
ACCOUNTING STUDIO     Tell Kanakku what you want.
      ↓
LEDGER                What did Kanakku record?
      ↓
RECON                 Does what happened match what Kanakku recorded?
```

## Layers

```
app/                         Next.js playground (React)
  api/engine                 In-memory engine session over HTTP
src/domain                   Pure accounting, policy, ledger, recon
src/application              Services that orchestrate domain objects
src/infrastructure           In-memory repos + optional LLM providers
```

Domain code does not talk to the network. Journals are produced from a policy version and a business event. If two inputs are the same, the journal is the same.

## Kernel

| Piece | Role |
|---|---|
| **BusinessEvent** | Something that happened: purchase, refund, usage, wallet, marketplace sale, payout |
| **Policy / PolicyVersion** | Versioned rules with effective dates |
| **Policy DSL** | Human-readable rules compiled to an intermediate representation |
| **AccountingEngine** | Match a rule, resolve amounts, generate a balanced journal, post |
| **Ledger** | Derived from posted journals (trial balance, account history) |
| **Transactional ledger** | Operational balances (wallets, seller payables) next to the financial books |
| **Recon** | Deterministic comparison of an external statement to Kanakku transactions |

Amounts can come from the event, a fixed value, an event attribute, or a rate (fee %, tax %, usage × unit price).

## Playground session

`EngineService` holds an in-memory tenant: chart of accounts, seeded demo transactions, policy rules, and posted journals. The Next route at `/api/engine` talks to that session.

This is enough to demo the product. It is **not** a multi-user database. Reloading a serverless instance resets the books. See [DEPLOY.md](./DEPLOY.md).

## What this is not (yet)

- Bank feeds, Plaid, or ERP connectors
- Period close / lock
- Multi-currency
- Fuzzy / ML matching in Recon
- Durable multi-tenant production storage

Those are future work. The kernel is built so they can sit *outside* posting, not inside it.
