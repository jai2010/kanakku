# Security

This repository is an in-memory accounting **demo**. Do not store real customer books, bank credentials, or production secrets in it.

## Reporting

If you find a vulnerability in the kernel or the playground, email **jaiganesh@gmail.com** or open a private GitHub security advisory on [jai2010/sutra](https://github.com/jai2010/sutra).

Please do not file a public issue for unposted secrets or injection into policy evaluation until we have had a chance to patch.

## What we care about

- Policy evaluation that posts an unbalanced journal
- A way to skip validation or post without a matching rule
- Cross-tenant reads, if any tenant boundary is added later
- Secret leakage through logs or the playground API

The hosted demo at [kanakku.vercel.app](https://kanakku.vercel.app) resets on cold start and is not a production ledger.
