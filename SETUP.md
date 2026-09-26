# ENS402 setup runbook

Start with [README.md](README.md) for current scope and status. This file contains operator actions only. No mainnet funds or transactions.

## 1. Environment configuration

Put local values in the repository root `.env`. Never paste secrets into chat.

| Variable | What you supply |
| --- | --- |
| `PRIVY_APP_ID` | Your Privy application ID |
| `PRIVY_APP_SECRET` | That application's server secret |
| `SERVICE_ENS_NAME` | Optional comma-separated service suggestions; users may enter other supported ENS names |
| `ENS_OWNER_ADDRESS` | The wallet or Safe that owns that name and can set its resolver |
| `ENS_OPERATOR_ADDRESS` | A separate Ops wallet for endpoint, description and picture grants |
| `MERCHANT_PAY_TO` | The Treasury address that will receive Base Sepolia USDC |
| `DATABASE_URL` on Vercel | A durable, network-accessible PostgreSQL connection string. The local DB cannot be reached from Vercel. Use the provider's required TLS settings. |

Production Privy credentials and Neon are configured; the production schema health check passed. Keep local PostgreSQL separate. Existing Intercepta and RPC settings can be reused. `DEMO_ACCESS_TOKEN` is a distinct randomly generated operator token, not a Privy credential. The local token is stored in root `.env`; enter it only into `/operator` on your own deployment. Do not publish it in the pitch.

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

## 3. Choose the ENS setup workflow

Use `pnpm ens:namespace:plan` for the platform parent. Use `/register` for a new subname, or `pnpm ens:plan` for an already registered service. These are different workflows.

### Configure one existing service

Register a testnet name at https://app.ens.dev, or ask the ENS sponsor for one. The default integration pins contracts-v2 commit `71a3b7339dbc55ab47667abdfe8303bac4f4c24e`. Legacy deployment compatibility is tested separately. See the [remaining setup checklist](#remaining-public-demo-setup) for the parent namespace workflow.

After filling the public name/owner/operator/Treasury/endpoint variables:

```sh
pnpm ens:plan
```

This creates ignored `docs/setup/ens-transactions.json`. It simulates deployment and prepares an ordered transaction plan, without sending transactions:

1. Deploy a native PermissionedResolver through ENS's VerifiableFactory.
2. Write endpoint, fixed-price payment, status, description and optional picture records.
3. Grant Ops separate `agent-endpoint[x402]`, `description` and `avatar` permissions, and Treasury `ens402.payment` permission. Set `ENS_TREASURY_ADDRESS` separately from `MERCHANT_PAY_TO`.
4. Set the registered name's resolver pointer last.

The name owner must review and submit the transactions in order with Sepolia ETH for gas. The generated resolver grants root text writing/administration to that owner; alias and upgrade roles are not assigned. Parent registry and resolver-pointer powers still exist and are documented.

The console can manage records after the service has a valid configuration. Its wallet button uses your browser's Ethereum wallet and verifies Sepolia before submission. It does not hold the seller's private key.

## 4. Verify Privy and create the payer

```sh
pnpm test:privy:live
pnpm test:intercepta:live
```

The Privy test creates an unfunded, disposable wallet and policy, verifies a tiny self-payment signature, tests forbidden direct provider calls, and restores deny-all. No transfer is submitted and no signature is persisted. Policy/wallet IDs and results are saved under ignored `docs/validation/`.

Open `/console`, sign in with Privy, inspect a current ENSv2 Sepolia name, then explicitly approve endpoint(s), recipient, amount, daily budget and expiry. Choose managed signing to provision a new Privy payer, or self signing to use your connected EOA without creating a platform wallet. **Fund the payer address shown on that approval card with Base Sepolia USDC.** Do not send mainnet USDC. The reference flow uses a facilitator, so the payer signs a token authorization; seller ENS writes separately require Sepolia ETH.

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

Current completion status is in [README.md](README.md); detailed test boundaries are in [AUDIT.md](AUDIT.md).

## 8. Full local Anvil rehearsal

```sh
pnpm test:anvil
```

This starts disposable Sepolia and Base Sepolia Anvil forks plus a temporary PostgreSQL cluster. It registers names through native ENS contracts, funds a local payer through the deployed USDC minter, executes actual EIP-3009 transfers through a local HTTP merchant, and verifies balances, nonce replay protection, ledger idempotency, recipient changes, screening holds, lost responses, reconciliation, delivery errors and budget/revocation behavior. No transaction is sent to a public network. Temporary processes/data are cleaned up.

Set `ENS_FORK_RPC_URL` or `BASE_SEPOLIA_RPC_URL` if public RPCs are unreliable. `BASE_FORK_BLOCK` optionally pins the payment fork; the report records the block used. The harness uses a public fixture key and deterministic screening responses, not Privy or Intercepta credentials. Production HTTPS transport is unchanged; only the test injects a loopback HTTP bridge. The local merchant/relayer is a test adapter rather than the deployed merchant or public facilitator. Their orchestration is covered separately by server integration tests. Provider enforcement and real deployment credentials remain separate live gates.


## Hosted users, independent signers and agent access

- `/console` uses Privy email/wallet login. Allow the production URL in the Privy dashboard. The server verifies the access token and derives the user ID; a caller cannot supply ownership in JSON.
- `/operator` retains the private demo token for maintenance. Do not distribute that token to users or agents.
- Every approval belongs to a user. Managed mode provisions a policy-bound wallet. Self mode records the payer and never provisions a Privy wallet.
- Create an agent key on an approval card. The raw key is shown once; PostgreSQL stores its SHA-256 hash. Keys expire with the approval and can be revoked independently. Agents cannot create approvals, modify policies, change recipients or view the whole account.
- The `/api/v1` endpoint accepts scoped agent keys or verified user tokens. SDK methods and the complete workflow are documented at `/docs`. The agent Skill is `integrations/agent-skill/SKILL.md`.
- SDK packages are workspace packages, not published npm releases. Use this checkout's workspace or package them deliberately for your integrator.
- Resource requests support GET and bounded JSON POST to the exact ENS-published HTTPS URL. POST requires a UUID v4 order ID and a merchant implementing ENS402 request binding. Forwarded authentication headers are not supported. The SSRF-safe transport rejects private IPs and redirects and pins DNS for each request.
- Self signing is a two-step flow: prepare a durable attempt, sign its exact typed data, submit the signature. The server verifies the EOA signature and rechecks current ENS, screening, revocation and budget before sending it. Smart contract wallets are not supported in this reference path.
- Core `purchaseResource` remains usable without our hosted service. Integrators supply their own signer, persistence, transport, approval and settlement verification.

## Neon production database

`ens402-db` is connected through Vercel Marketplace to production. `DATABASE_URL` is the pooled Neon URL; migration tooling can use `DATABASE_URL_UNPOOLED`. The existing `pg` pool uses ordinary PostgreSQL and does not need replacement with a new ORM. Production schema migration and health check passed. The localhost connection remains local only. Preview does not share production data.

Optional local `PRODUCTION_DATABASE_URL` / `PRODUCTION_DATABASE_URL_UNPOOLED` settings are used only by `scripts/db-production-check.ts` and remain in ignored `.env`. Do not upload those aliases as extra Vercel application variables.

## Namespace setup

See the [remaining setup checklist](#remaining-public-demo-setup). The official current ENSv2 testnet app is https://app.ens.dev. The current SDK defaults to the official deployment pinned at source `71a3b733`; the older deployment remains an explicit `legacy` option for historical tests. Current key grants apply within a resolver, so use one resolver per service.

After registering the parent, run `pnpm ens:namespace:plan`. It produces an unsigned plan and refuses to replace an existing subregistry. `SERVICE_REGISTRAR_ADDRESS` and `ENS_PARENT_NAME` enable `/register`. The contract uses native EAC; it does not implement a competing permission system. Parent administrators and fixed expiry remain trust boundaries. No public-network deployment is performed by tests.

## Fixed-price subname purchase

Start with the ordered checklist in [AUDIT.md](AUDIT.md). `pnpm ens:namespace:plan --native-only` prepares the minimum official ENS namespace without a custom registrar. The worker needs its own server-only Sepolia key and native ROLE_REGISTRAR. It must never use the parent Admin key. The endpoint is POST `/api/merchant/register`; order status is GET `/api/merchant/registration-orders/<orderId>`. Publish payment schema v2 and the same `MERCHANT_PRICE_UNITS` in ENS before approval. The production additive database migration must run before enabling this route.

## Remaining public demo setup

The last recorded Sepolia check, block 11786000, showed the parent is owned but its child registry is zero. This is a dated observation, not continuous monitoring.

For the paid-name demo, set `ENS_PARENT_NAME` and `ENS_OWNER_ADDRESS` locally and run `pnpm ens:namespace:plan --native-only`. Review `docs/setup/namespace-transactions.json`: the owner creates an official UserRegistry instance, points the parent to it, then grants only `ROLE_REGISTRAR` to a dedicated worker. No transaction has been sent. Fund the worker with Sepolia ETH.

Configure `ENS_PURCHASE_REGISTRY`, `ENS_PURCHASE_EXPIRY`, server-only `ENS_REGISTRATION_PRIVATE_KEY`, and `ENS_REGISTRATION_RESOURCE_URL` in Vercel. The worker wallet is separate from Admin, Ops, Treasury and the buyer.

Use the namespace owner's registrar authority to register `buy` directly to the service Admin in the native UserRegistry, initially without a resolver. Give the Admin the native set-resolver and associated administration rights. Then `pnpm ens:plan` prepares its dedicated resolver, records and scoped Ops/Treasury grants. Set `SERVICE_ENS_NAME`, `MERCHANT_PAY_TO`, `MERCHANT_PRICE_UNITS`, and `SERVICE_DESCRIPTION`; the registration URL must be the configured service endpoint. See `AUDIT.md` for the full inventory.

For the existing direct-service self-registration through `/register`, use the non-native-only plan and deploy our `ServiceRegistrar`, then grant it `ROLE_REGISTRAR` and set `SERVICE_REGISTRAR_ADDRESS`. This is separate from the paid-name merchant. `/register` stays disabled until configured. A service registration creates a native resolver and delegates its records; a paid-name purchase simply issues a name directly to its recipient without a resolver. A later name transfer does not automatically transfer an existing resolver's administration.

Run `pnpm ens:permissions:check` after the service is published. Missing setup does not pass. Complete a real Privy login and fund the displayed buyer with Base Sepolia USDC, then verify both payment and name-delivery receipts.

## Demo wallet assignments

Use three distinct wallets:

| Responsibility | Public address | Funding |
| --- | --- | --- |
| Platform owner / demo service Admin | `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380` | Sepolia ETH for setup and grants |
| Ops endpoint writer | `0x03eEe8Be9682D6DF713563FDf7f8D1eD78d7479D` | Sepolia ETH for record updates |
| Treasury payment-record writer | `0x0Ca23D06479560bb9A916c19Df5a2948a8ed3346` | Sepolia ETH for record updates |

Ops and Treasury are freshly generated test-only wallets. Their keys are stored only in ignored root `.env` as `ENS_OPS_TEST_PRIVATE_KEY` and `ENS_TREASURY_TEST_PRIVATE_KEY`; the file is owner-readable/writable only. No roles have been granted and no transaction has been sent from them. The Admin key was not requested or copied. Funding these two writers does not fund the separate Base Sepolia USDC payer. The USDC receiving address remains `MERCHANT_PAY_TO`, an independent configuration.

## Native contract roles

ENS official contracts enforce permissions. Interfaces only declare their ABI. Each service uses a dedicated native PermissionedResolver because setter-key grants apply across records within that resolver.

| Wallet | Contract and scope | Native role |
| --- | --- | --- |
| Namespace owner | UserRegistry root | `ROLE_REGISTRAR` + `ROLE_REGISTRAR_ADMIN` |
| Registration worker or optional ServiceRegistrar | UserRegistry root | `ROLE_REGISTRAR` only |
| Service Admin | Service name | `ROLE_SET_RESOLVER`, `ROLE_SET_RESOLVER_ADMIN`, `ROLE_CAN_TRANSFER_ADMIN` |
| Service Admin | Resolver root | `ROLE_SET_TEXT` + `ROLE_SET_TEXT_ADMIN` |
| Ops | Separate hashes of endpoint, description and avatar keys | `ROLE_SET_TEXT` |
| Treasury writer | Hash of `ens402.payment` key | `ROLE_SET_TEXT` |

Ops must differ from Admin and Treasury. Treasury may equal Admin but then retains broader authority. A payout recipient gains no ENS role by receiving USDC. These are intended grants, not a live audit.

Our optional `contracts/src/ServiceRegistrar.sol` uses commit/reveal to deploy a native resolver, publish records, grant delegates, hand root text administration to the service registrant and remove its own resolver privileges in one reverting transaction. Commitments wait 60 seconds and expire after one day. It has reentrancy protection, narrow ASCII labels and bounded inputs. Native role constants and deployment pins are in `contracts/src/libraries/`; external ABIs are in `contracts/src/interfaces/`.

The paid subname worker instead calls native register directly with no resolver and no separate transfer. Parent/root authority and expiry remain trust boundaries. Name transfer does not transfer an existing resolver's administration. ENS role revocation cannot cancel a previously issued payment authorization. See AUDIT.md for deployment inventory and recovery limits.

## Setup command reference

| Goal | Command | Unsigned output |
| --- | --- | --- |
| Enable native paid-name issuance | `pnpm ens:namespace:plan --native-only` | `docs/setup/namespace-transactions.json` |
| Enable optional full-service registrar | `pnpm ens:namespace:plan` | Same output, includes custom registrar deployment |
| Configure one existing service | `pnpm ens:plan` | `docs/setup/ens-transactions.json` |
| Verify named-wallet text roles | `pnpm ens:permissions:check` | Read-only report in `docs/validation/live-text-permissions.json` |

Namespace planners refuse to replace an existing child registry. They simulate the initial factory deployment only; later steps depend on earlier confirmed transactions. Plans never sign or broadcast. Use the existing-service planner for a service, not the parent namespace.

The service planner needs `SERVICE_ENS_NAME`, `ENS_OWNER_ADDRESS`, `ENS_OPERATOR_ADDRESS`, `ENS_TREASURY_ADDRESS`, `MERCHANT_RESOURCE_URL`, `MERCHANT_PAY_TO`, `MERCHANT_PRICE_UNITS`, `SERVICE_DESCRIPTION`, optional `SERVICE_PICTURE_URL` and `SEPOLIA_RPC_URL`. Publish the resolver pointer last. Recheck roles after changes. The audit checks named wallets' effective text roles, not every administrator or ancestor power.

## Presentation walkthrough

Prepare namespace, worker, service resolver, grants, expiry and gas first. Sign in to Console, approve the exact endpoint and fixed price, and fund the shown payer with Base Sepolia USDC. Contract recipients must accept ERC1155 transfers.

1. Show the service's ENS records and separate Admin/Ops/Treasury responsibilities.
2. Choose a fresh label and recipient. Each order uses a fresh UUID v4; the signature binds the endpoint and exact JSON body.
3. Show Guard checking ENS versus HTTP 402, buyer consent and Intercepta evidence before signing.
4. Pay once and verify the Base Sepolia receipt plus Sepolia recipient ownership. The current endpoint sells subnames, not arbitrary `.eth` names.
5. Inspect `/api/merchant/registration-orders/<orderId>`. Recover pending delivery without paying again; undeliverable paid orders require manual refund review.

For governance scenes use a separate sample-data service: `/api/merchant/search`, `/api/merchant/search-v2` and `/api/merchant/search-mismatch`. Approve their exact URLs for the controlled demo. Show an allowed Ops endpoint update, a rejected Ops payment edit, an HTTP recipient mismatch blocked before signing, and Treasury price changes requiring renewed approval. Restore normal settings afterward. These sample Search routes are not the planned discovery Search API.

Fork and provider checks do not replace a public funded rehearsal. Catalog indexing and the provider registry tree are required scope but remain unimplemented. The current setup scripts enable direct subnames only; they do not complete Platform -> Provider -> Service onboarding or Admin handovers. See TODO.md for the required provider setup and role-management acceptance criteria.
