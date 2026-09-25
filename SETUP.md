# ENS402 operator setup

## What is already implemented

- An authenticated operating console at `/console` and Next.js backend APIs.
- Registered ENSv2 service resolution through a pinned Sepolia Universal Resolver, factory/implementation checks, explicit owner/resolver observations, and alias rejection.
- Native ENS record-edit and text-permission transaction preparation, simulation and browser-wallet submission.
- Explicit buyer approval with a per-payment limit, UTC daily backend budget, expiry and exact endpoint allowlist.
- A separate Privy agent wallet and restrictive policy for each approval. Existing wallets and policies are not silently reused.
- Intercepta screening with a bounded one-hour cache. Missing/stale evidence holds payment.
- Actual x402 v2 HTTP challenge, EIP-3009 signing, one-time HTTP submission, and independent Base Sepolia receipt verification for both the USDC transfer and authorization nonce.
- A paid demonstration merchant at `/api/merchant/search`, using a facilitator to verify and settle.
- PostgreSQL decision receipts, concurrent budget reservations, request idempotency and uncertain-payment reconciliation.

World and ERC-8004 are outside this implementation scope. No mainnet transaction is needed.

## 1. Provide these missing values

Put local values in the repository root `.env`. Never paste secrets into chat.

| Variable | What you supply |
| --- | --- |
| `PRIVY_APP_ID` | Your Privy application ID |
| `PRIVY_APP_SECRET` | That application's server secret |
| `SERVICE_ENS_NAME` | A registered ENSv2 Sepolia service name that you control |
| `ENS_OWNER_ADDRESS` | The wallet or Safe that owns that name and can set its resolver |
| `ENS_OPERATOR_ADDRESS` | A different wallet to demonstrate endpoint-only delegation |
| `MERCHANT_PAY_TO` | The Treasury address that will receive Base Sepolia USDC |
| `DATABASE_URL` on Vercel | A durable, network-accessible PostgreSQL connection string. The local DB cannot be reached from Vercel. Use the provider's required TLS settings. |

Existing Intercepta and RPC settings can be reused. `DEMO_ACCESS_TOKEN` is a distinct randomly generated operator token, not a Privy credential. The local token is stored in root `.env`; enter it only into `/console` on your own deployment. Do not publish it in the pitch.

The console reports variable presence only. It does not assert that credentials, balances or permissions work.

## 2. Local database and development

Prerequisites: Node 22 or later, pnpm, PostgreSQL command-line tools, and Foundry for native contract tests.

```sh
pnpm install
pnpm db:local
pnpm db:migrate
pnpm setup:check
pnpm dev
```

`db:local` creates a project-owned PostgreSQL cluster under ignored `.local/postgres`, bound only to `127.0.0.1:5442`. It updates root `.env`'s DATABASE_URL. It never modifies `.env.local` or another database cluster. This development cluster uses local trust authentication; it is not for public hosting.

To stop the local cluster:

```sh
pg_ctl -D "$PWD/.local/postgres/data" -m fast -w stop
```

For a managed database, set DATABASE_URL and run only `pnpm db:migrate`. Migration creates ENS402-prefixed tables and does not alter legacy tables.

## 3. Configure the ENS service

Ask the ENS sponsor to provide a registered name on the supported ENSv2 Sepolia deployment. The current integration is pinned to contracts-v2 commit `48b3e2d39513b9dd32ef1850877a29009bc807b9`; newer deployment APIs may differ.

After filling the public name/owner/operator/Treasury/endpoint variables:

```sh
pnpm ens:plan
```

This creates ignored `docs/setup/ens-transactions.json`. It simulates deployment and prepares an ordered transaction plan, without sending transactions:

1. Deploy a native PermissionedResolver through ENS's VerifiableFactory.
2. Write endpoint, payment and active status records.
3. Grant the operator only `agent-endpoint[x402]` write permission.
4. Set the registered name's resolver pointer last.

The name owner must review and submit the transactions in order with Sepolia ETH for gas. The generated resolver grants root text writing/administration to that owner; alias and upgrade roles are not assigned. Parent registry and resolver-pointer powers still exist and are documented.

The console can manage records after the service has a valid configuration. Its wallet button uses your browser's Ethereum wallet and verifies Sepolia before submission. It does not hold the seller's private key.

## 4. Verify Privy and create the payer

```sh
pnpm test:privy:live
pnpm test:intercepta:live
```

The Privy test creates an unfunded, disposable wallet and policy, verifies a tiny self-payment signature, tests forbidden direct provider calls, and restores deny-all. No transfer is submitted and no signature is persisted. Policy/wallet IDs and results are saved under ignored `docs/validation/`.

Open `/console`, enter DEMO_ACCESS_TOKEN, inspect the configured name, then explicitly approve endpoint(s), recipient, amount, daily budget and expiry. This provisions a new Privy payer. **Fund the payer address shown on that approval card with Base Sepolia USDC.** Do not send mainnet USDC. The reference flow uses a facilitator, so the payer signs a token authorization; seller ENS writes separately require Sepolia ETH.

If wallet provisioning is interrupted, use **Resume wallet setup** on its approval card. Retries reuse the same provider keys for up to 23 hours. After that, revoke the incomplete approval, review its Privy resources, and create a new approval. Do not fund orphan resources.

The per-authorization limits are configured in Privy. Daily totals are enforced by the trusted backend database, not by Privy typed-data aggregation. The server app secret can modify policies, so the backend remains trusted.

## 5. Run the real purchase and permission demo

1. Check the payer's balance, then select **Buy once**.
2. Inspect resolve, compare, screen, sign, submit and settlement evidence in the activity entry.
3. Verify the Base Sepolia transaction link and returned demo resource.
4. With the endpoint operator wallet, simulate and submit an endpoint update within the buyer-approved endpoint list. Resolve again.
5. Attempt to edit `ens402.payment` as the operator. Native simulation must reject it.
6. Revoke the operator's endpoint permission and repeat the endpoint edit attempt. It must fail unless a broader root/name permission remains.
7. Change Treasury using its authorized wallet. A prior buyer approval must stop matching; explicitly approve the new recipient.

The included second merchant route is `/api/merchant/search-v2`. Choose **Also approve the demo v2 route** when creating the buyer approval, then update the ENS endpoint to that URL. For other merchants, deploy a second functioning URL and include both exact URLs in the explicit approval. A different unapproved URL deliberately holds/rejects the flow.

After a submission timeout, do not pay again. The attempt and budget reservation remain. Use **Reconcile this attempt** with the transaction hash; the backend checks the original nonce and transfer. Successful payment and successful resource delivery are reported separately. A process crash can leave a reserved or processing record. **Cancel unsent attempt** releases only a still-reserved execution and atomically prevents a concurrent worker from submitting it. A submitting or merchant-processing record requires reconciliation; it is never silently retried.

## 6. Deploy the backend

Vercel project: `ens402`; root directory: `apps/web`. Set the same required server variables in Vercel Production. Use a cloud DATABASE_URL and run the migration against that database before using the console. Do not upload the loopback development URL.

Run migrations from a trusted shell with the production DATABASE_URL injected, or temporarily use a dedicated local environment file through your secret manager. Do not print the connection string. Environment changes require a new deployment.

The merchant additionally requires MERCHANT_PAY_TO and MERCHANT_RESOURCE_URL. Its default public testnet facilitator is `https://x402.org/facilitator`; its `/supported` response was checked for x402 v2 exact Base Sepolia support. Availability and balances must still be checked at demo time.

## 7. Reproduce tests

```sh
pnpm test
pnpm test:integration
pnpm test:contracts
pnpm test:ens:fork
pnpm typecheck
pnpm build
```

- Fast tests cover hostile request changes, signatures, HTTP parsing, settlement proofs, authentication and outbound-network restrictions.
- Integration tests start independent temporary PostgreSQL clusters and use simulated ENS/provider responses with real x402 message encoding and real cryptographic signatures. These tests do not prove live provider behavior.
- Contract and SDK fork tests use actual pinned ENS deployments on disposable Sepolia forks, including local name registrations, grants, revocation and resolution. No fork transaction appears on Sepolia.
- Credential-dependent live tests and a real funded settlement remain separate evidence gates.

The full completion checklist is in `IMPLEMENTATION.md`.
