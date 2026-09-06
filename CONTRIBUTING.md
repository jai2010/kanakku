# Contributing

Thanks for looking at Kanakku.

This is an open demo of a deterministic accounting engine. The most useful contributions keep posting **correct, explainable, and tested**.

## Setup

```bash
git clone https://github.com/jai2010/sutra.git
cd sutra
npm install
npm test
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000).

## How the repo is split

| Path | Change this when |
|---|---|
| `src/domain` | Accounting invariants, policy DSL, matching |
| `src/application` | Orchestration, demo seeds, services |
| `src/infrastructure` | Repositories, LLM providers |
| `app/` | Playground UI |
| `tests/` | Jest suites |

Do not put posting logic in React components. The UI should call the engine, not reimplement it.

## Tests

```bash
npx tsc --noEmit
npm test
npm run build
```

If you change accounting behavior, add a kernel test under `tests/` (golden, engine, or policy). If you change a playground surface, add or extend a test under `tests/playground/`.

## Product language

User-visible copy is **Kanakku**, never Sutra.

```
Speak English. Kanakku handles the accounting.
```

Internal code names can stay as they are. New UI strings should not mention Sutra.

## Scope to avoid

Please do not send PRs that add bank integrations, Plaid, ERP connectors, ML matching, or a new infrastructure stack unless that work was discussed in an issue first. The demo is intentionally small.

## Pull requests

1. One idea per PR.
2. Keep the existing surfaces working: Transactions, Engine, Accounting Studio, Ledger, Recon.
3. Include the test and typecheck commands you ran.

## License

By contributing you agree that your work is licensed under the MIT License.
