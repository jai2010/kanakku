# KANAKKU

**Speak English. Kanakku handles the accounting.**

Open-source playground for a deterministic accounting engine. Drop in a transaction, watch the policy fire, and see a balanced journal post.

[![Live demo](https://img.shields.io/badge/demo-kanakku.vercel.app-39a8ff?style=flat-square)](https://kanakku.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ce38a?style=flat-square)](LICENSE)
[![CI](https://github.com/jai2010/sutra/actions/workflows/test.yml/badge.svg)](https://github.com/jai2010/sutra/actions/workflows/test.yml)

**Live demo → [kanakku.vercel.app](https://kanakku.vercel.app)**

## Demo

![Kanakku demo](docs/media/kanakku-demo.mp4)

[Watch the demo](docs/media/kanakku-demo.mp4) · [Open the live playground](https://kanakku.vercel.app)

<p align="center">
  <img src="docs/media/engine.png" alt="Kanakku Engine posting a marketplace sale" />
</p>

## Why this exists

Most accounting software hides the posting rules. Kanakku puts them in front of you.

You speak in business language. Kanakku matches a policy, builds a double-entry journal, and posts it. The same input always produces the same journal.

That is the whole product:

| Surface | Question |
|---|---|
| **Transactions** | What happened? |
| **Engine** | How does Kanakku account for it? |
| **Accounting Studio** | Tell Kanakku what you want. |
| **Ledger** | What did Kanakku record? |
| **Recon** | Does what happened match what Kanakku recorded? |

## Surfaces

**Engine** — send a purchase, refund, usage event, wallet movement, or marketplace sale. Watch policy, rules, operational effect, journal, validator, and ledger fire in order.

**Transactions** — the operational record: buyers, sellers, wallets, payouts, and whether each event was accounted.

**Accounting Studio** — write English such as *“Treat Starbucks over ₹5,000 as Business Meals.”* Kanakku turns that into a versioned transformation.

**Ledger** — posted journals, account history, and a trial balance that has to balance.

**Recon** — a corporate-card statement against what Kanakku booked. Exact match, amount difference, missing in Kanakku, missing externally, resolved.

<p align="center">
  <img src="docs/media/transactions.png" alt="Transactions" width="49%" />
  <img src="docs/media/studio.png" alt="Accounting Studio" width="49%" />
</p>
<p align="center">
  <img src="docs/media/ledger.png" alt="Ledger" width="49%" />
  <img src="docs/media/recon.png" alt="Reconciliation" width="49%" />
</p>

## Quick start

```bash
git clone https://github.com/jai2010/sutra.git
cd sutra
npm install
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test              # kernel + playground tests
npx tsc --noEmit      # kernel types
npm run build         # kernel + Next production build
```

No API keys are required. Accounting Studio’s English compiler uses a fake LLM unless you set one — see [`.env.example`](.env.example).

## How posting works

```
Business event
      ↓
Policy version (effective-dated rules)
      ↓
Matched transformation
      ↓
Balanced journal  (DR = CR)
      ↓
Posted ledger + optional operational balances
```

Rules are stored as a small DSL, compiled, and evaluated deterministically. Amounts can be the event total, a fixed figure, an attribute, or a rate (marketplace fee, tax, usage × unit price).

The kernel does **not** call an LLM to decide the journal. AI is only an authoring aid. Simulation and posting stay deterministic.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What this demo is

- An in-memory playground with seeded Indian-rupee demo data
- A real double-entry engine, policy DSL, and test suite
- A public UI at [kanakku.vercel.app](https://kanakku.vercel.app)

## What this demo is not

- Not a bank feed, Plaid, or ERP connector
- Not a production multi-tenant general ledger
- Not a close / lock / multi-currency system
- Recon is deterministic matching, not ML

Reloading a serverless instance resets the in-memory books. That is expected. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Documentation

| | |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Kernel, layers, posting path |
| [Deploy](docs/DEPLOY.md) | Vercel, env, in-memory limits |
| [Contributing](CONTRIBUTING.md) | How to change the engine or UI |
| [License](LICENSE) | MIT |

## License

MIT. See [LICENSE](LICENSE).
