# ENS402

**Let agents find services. Verify where they pay.**

ENS402 checks an x402 payment request against the merchant's public ENS configuration, buyer approval, and Intercepta address-risk evidence before requesting a signature. Native ENSv2 EAC separates who can edit the API URL from who can edit payment settings.

## Implementation

- `apps/web`: shadcn/ui landing, architecture diagram, sponsor Q&A and interactive fixture scenarios using the actual SDK rules.
- `packages/sdk`: wallet-independent request/risk checks, server-side Intercepta adapter, upstream x402 authorization generation, and a server-side Privy signer and policy builder.
- Privy is the reference demo signer. Integrators supply their own provider account; the core has no Privy or World dependency.
- Native ENS resolver permissions were tested separately on a disposable Sepolia fork. The SDK currently accepts an integrator-supplied resolved snapshot; it does not establish registry ownership or resolve registered names itself.

## Run and test

```sh
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Copy `.env.example` to `.env` and fill the server credentials. Preserve any existing `.env`; never commit keys. The public website requires no secrets.

```sh
pnpm test:intercepta:live
pnpm test:privy:live
```

The Intercepta command scans the provider's documentation example address, verifies caching, and saves a report under ignored `docs/validation/`.

The Privy command requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET`. It creates an unfunded disposable wallet under a deny-all policy, enables a short-lived Base Sepolia USDC self-payment scope, and tests an x402 signature. It then calls Privy directly with forbidden recipient, chain, token, amount, expiry, type-map and personal-sign requests. Non-policy errors are inconclusive, not passing tests. Finally it restores deny-all. No funds are transferred; signatures and private keys are never persisted. Test resources remain in your Privy dashboard and are identified in the local report.

## Adapter contract

`preparePayment` from `@ens402/sdk/x402` accepts a fresh `ServiceSnapshot`, the selected HTTP 402 requirement, the actual requested URL, a buyer `Approval`, a screening callback, and an x402-compatible signer. It returns a decision and evidence; only passing requests produce an authorization payload. The caller owns trusted ENS resolution, HTTP challenge parsing/selection, delivery, settlement and reconciliation.

`createPrivySigner` from `@ens402/sdk/privy` takes an integrator-owned Privy client and policy-bound wallet. Install the output of `buildPrivyPolicy` on that wallet before use. The local adapter validates and cryptographically checks signatures, but does not provision or attest the wallet policy. The live test script demonstrates provisioning and tests provider enforcement separately.

`InterceptaProvider` from `@ens402/sdk/intercepta` runs on the trusted server. Its process-local cache is address-scoped within the fixed Ethereum mainnet source, bounded to 1,000 entries, and expires after at most one hour. Failures never reuse expired clean evidence. ENS and approval checks run for every payment.

## Enforcement and current limits

- ENS enforces record writes. The SDK checks record values, freshness and the selected request.
- Privy policy is designed to restrict EIP-3009 signatures by chain, token, recipient, per-authorization amount and absolute expiry. Live enforcement remains unverified until the credential-dependent test succeeds.
- The app secret can change demo wallet policies. Keep it on a trusted backend, away from the agent/browser. This setup does not protect against compromise of that backend.
- No cumulative daily typed-data budget, session key, World approval, ERC-8004 reputation, automatic ENS ownership continuity, public signing endpoint, or settlement implementation is claimed.
- Risk evidence on Ethereum mainnet does not establish contract behavior on Base Sepolia.
- The browser demo uses synthetic inputs and sends no payment. Local tests use mocked provider transport and verify real cryptographic signatures. Genuine Intercepta results are separately recorded and labeled.

## Deployment and design

Vercel root: `apps/web`; build command: `pnpm build` from that directory. Workspace TypeScript source is consumed by Next.js. Public pitch and sources: `/architecture`.

`docs/IDEA.md` defines scope. `docs/DESIGN-CLARIFICATIONS.md` records decisions. Research and test receipts live in `docs/reference/` and `docs/validation/`; these local documents are Git-ignored. ENS is on Sepolia, payments on Base Sepolia.
