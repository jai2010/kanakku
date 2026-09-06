# Deploying the demo

The live playground is meant to run at [kanakku.vercel.app](https://kanakku.vercel.app).

## Vercel

1. Import this GitHub repository into [Vercel](https://vercel.com).
2. Framework preset: **Next.js**.
3. Build command: `npm run build`
4. Output: Next.js default (leave empty).
5. Environment variables: none required. The demo uses `LLM_PROVIDER=fake` by default.

Optional, if you want Accounting Studio to compile English into policy with a real model:

```
LLM_PROVIDER=xai
LLM_MODEL=grok-4
XAI_API_KEY=...
```

See `.env.example`.

## Important: in-memory state

The engine session lives in process memory.

On Vercel that means:

- A cold start shows a fresh seeded ledger.
- Two concurrent serverless instances do not share journals.
- This is acceptable for a public demo. It is not a production general ledger.

To run a longer-lived local demo:

```bash
npm run dev:web
```

Then open [http://localhost:3000](http://localhost:3000).

## Node

- Node 18+ (Next 14)
- `npm install`
- `npm run build` compiles the kernel (`tsc`) and the Next app
