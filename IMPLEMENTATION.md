# ENS402 implementation and evidence

Updated September 26, 2026. The application is implemented; a funded live demonstration is still gated by credentials, an ENS name and wallet funding.

| Layer | Implemented and checked | Remaining live gate |
| --- | --- | --- |
| ENS | Registered-name resolution, pinned deployment hashes, owner/resolver/version observation; actual SDK fork test | Controlled registered ENSv2 Sepolia name |
| Native EAC | Prepare/simulate writes and narrow grants; 11 native fork contract tests | Owner/operator transactions on Sepolia |
| x402 | Real v2 HTTP exchange, cryptographic authorization, single submission and chain receipt/nonce checks | Funded Base Sepolia settlement |
| Privy | Approval-specific wallet/policy, current-policy validation, revocation and bounded provisioning retry | App ID/Secret and provider rejection test |
| Intercepta | Genuine clean scan observed; one-hour cache and fail-closed risk rules | Risky classifications tested as fixtures only |
| Backend | Authenticated APIs; PostgreSQL budget locking, idempotency, durable nonce, cancellation and reconciliation | Cloud PostgreSQL for Vercel |
| Merchant | Two protected routes, signature validation, facilitator verify/settle and nonce deduplication | Configured Treasury and funded purchase |
| Frontend | Service inspection, explicit approval, funding address, payment receipt timeline, native seller controls | Full browser purchase with live credentials |
| CI | Unit, integration, typecheck/build and native fork workflows | GitHub Actions run `36188932735` passed |

## Test evidence

- 73 fast tests pass: SDK/risk/signature/HTTP/settlement/configuration checks.
- 19 database/workflow tests pass using temporary PostgreSQL; external provider responses are simulated.
- 11 native contract tests pass on a pinned Sepolia fork.
- SDK registered-name resolution, native permissions and alias rejection pass on a disposable fork.
- Typecheck/build and browser validation are recorded with the release. A passing local suite is not evidence of live Privy policy enforcement or settled payment.

## Required user setup

All exact steps and variable names are in [SETUP.md](SETUP.md): Privy App ID/Secret, controlled ENSv2 name, owner/operator/Treasury addresses, production PostgreSQL, and Base Sepolia USDC funding. Keys belong in root `.env` locally and server-only Vercel settings.

## Explicit limits

- Backend daily budgets are per approval and UTC day, not a global wallet-level on-chain cap. Operator access can create additional approvals.
- The backend/app secret can modify Privy policies. The SDK cannot constrain an arbitrary unrestricted key.
- ENS authority observations do not enumerate every administrator or ancestor power. Cross-chain reads and payment are not atomic.
- A transmitted authorization retains its reservation until a matching transaction is reconciled. Unknown settlement is never retried automatically.
- Incomplete wallet provisioning can resume with the same provider idempotency keys for at most 23 hours, within the provider's 24-hour window. Afterwards revoke the approval, review any resources in Privy and create a fresh approval. Do not fund orphan provisioning resources.
- A merchant crash after claiming a nonce can require manual transaction investigation; it never attempts a second settlement for that nonce. Buyer reconciliation can confirm payment without claiming resource delivery.
- World and ERC-8004 are not required runtime dependencies. The core remains wallet-provider independent.

## Release verification

Implementation commit `8147b52` passed both GitHub Actions jobs and deployed successfully to https://ens402.vercel.app. Public pages and status return 200; unauthenticated control returns 401. Production correctly reports missing database, Privy credentials and ENS name.

Browser login, service inspection, approval, paid-receipt display and revocation were exercised. Inspection/approval/payment UI used explicitly injected browser fixtures, not live provider calls. The real local login used PostgreSQL. At 390 CSS pixels, console and architecture have no page-level horizontal overflow. The initial Ego screenshot capture timed out. A subsequent built-in browser inspection successfully verified the deployed desktop architecture diagram and mobile (390px) public console setup screen. Authenticated live payment screens still require the missing production configuration.

The historical Vercel project `hufu402-merchant` still points to removed `apps/merchant` and has a failing deployment status. The current merchant routes are inside the successful ENS402 deployment. The old project was preserved.

## Dual-Anvil payment evidence

The native Sepolia ENS fork was joined to a Base Sepolia USDC fork (block `47301025`) and a temporary PostgreSQL ledger. Actual token transfers, balances, AuthorizationUsed nonces and replay reverts passed. Recipient mismatch, native Treasury rotation and screening holds prevented signing. A lost HTTP response after payment retained the budget and reconciled only against the original nonce; delivery failure remained spent; daily limits and revocation prevented further payments.

Run `pnpm test:anvil`. The local signer, screening response and merchant/relayer are test adapters. This proves actual local contract execution and SDK/ledger integration, not live Privy, Intercepta or public facilitator behavior. Production server orchestration is covered separately by the existing integration suite. No transaction was sent to a public network.
