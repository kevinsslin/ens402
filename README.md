# ENS402

**A name to resolve. A payment to verify.**

An ENS-based public service configuration and payment verification stack for x402. Resolve current endpoints, verify actual payment requirements, screen risk, and hand off to the integrator's own policy and wallet.

## Current implementation

- Next.js landing page and architecture notes, built with recovered shadcn/ui primitives.
- Interactive, explicitly illustrative endpoint-change and payment-mismatch examples.
- Native ENS resolver permissions were tested separately on a disposable Sepolia fork.
- A reusable SDK, live ENS service resolution, real risk screening, and complete testnet payment integration remain under development. No published npm package is claimed.

The core design does not require a Privy/CDP account, our hosted buyer database, or World authentication. Those can be independent adapters or reference integrations. ENS enforces record-write permissions; payment enforcement depends on the signing path an integrator chooses.

## Run locally

```sh
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```

Web project: `apps/web`. Vercel root directory: `apps/web`. Build command: `pnpm build` from that directory. The landing page requires no secrets.

## Design records

`docs/IDEA.md` is the current scope; `docs/DESIGN-CLARIFICATIONS.md` records the discussion and superseded choices. Research and fork validation are in `docs/reference/` and `docs/validation/`. These local documents are Git-ignored. Public-facing architecture and evidence boundaries are available at `/architecture`.

ENS uses Sepolia; payments use Base Sepolia. This repository remains exploratory. Historical HuFu payment code is retained in Git history; see `AGENTS.md` for development rules.
