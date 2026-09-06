# Architecture

Kanakku is a **deterministic accounting kernel**. The playground UI is a showcase of that kernel, not the system itself.

The kernel decides what to post. The showcase lets you watch it, teach a policy, inspect the books, and reconcile.

```
WHAT HAPPENED                         HOW IT WAS ACCOUNTED
─────────────                         ────────────────────
Business event                        Policy version
                                      Matched transformation
                                      Journal (DR = CR)
                                      Financial ledger
                                      Operational balances
```

## Layers

```
src/domain            Pure accounting, policy, ledger, recon
src/application       Orchestration: evaluate → journal → post
src/infrastructure    In-memory repositories, optional LLM providers
app/                  Showcase UI (Next.js). Not required to use the kernel.
```

Domain code does not talk to the network. Journals are produced from a policy version and a business event. If two inputs are the same, the journal is the same.

## Kernel

| Piece | Role |
|---|---|
| **BusinessEvent** | Economic fact: purchase, refund, usage, wallet, marketplace sale, payout |
| **Policy / PolicyVersion** | Versioned rules with effective dates |
| **Policy DSL** | Human-readable rules compiled to an intermediate representation |
| **AccountingEngine** | Match a rule, resolve amounts, generate a balanced journal, post |
| **Financial ledger** | Derived from posted journals (trial balance, account history) |
| **Transactional ledger** | Operational balances (wallets, seller payables) from the same treatment |
| **Recon** | Deterministic comparison of an external record to Kanakku books |

Amounts can come from the event, a fixed value, an event attribute, or a rate (fee %, tax %, usage × unit price).

AI may draft DSL. The kernel only evaluates compiled policy. Simulation and posting stay deterministic.

## Posting path

1. Resolve the active policy version for the event’s tenant and date.
2. Evaluate rules by priority. Equal-priority overlap is a conflict and fails closed.
3. Materialize financial lines and optional transactional effects.
4. Validate: known accounts, ≥1 debit, ≥1 credit, **DR = CR**.
5. Post. Reverse by inserting a reversing journal, never by mutating the original.

The evaluation carries the matched rule, the miss reason, and the lines. That is the audit trail.

## Showcase session

`EngineService` holds an in-memory tenant used only by `app/`. It is how the design is demonstrated at [kanakku.vercel.app](https://kanakku.vercel.app).

It is **not** a multi-user database. Reloading a serverless instance resets the books. See [DEPLOY.md](./DEPLOY.md).

## What does not belong in the kernel

- Bank feeds, Plaid, ERP connectors
- Period close / lock
- Multi-currency
- Fuzzy / ML matching
- Durable multi-tenant production storage

Those sit *outside* posting. They must not decide the journal.
