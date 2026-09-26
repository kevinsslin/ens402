# ENS402 setup runbook

Start with [README.md](README.md) for current scope and status. This file contains operator actions only. No mainnet funds or transactions.

## What Kevin needs to do next

1. Open `/provider`, sign in with **Continue with a wallet**, and select the wallet that owns `ens402.eth`. An email-created Privy wallet does not automatically control an existing ENS name.
2. Open **Platform owner setup**, then **Read Sepolia setup**. Review and confirm the two transactions: create the native Platform Registry, then attach it to `ens402.eth`. The UI verifies each receipt and can resume. No CLI or private-key export is required. Current bootstrap supports direct EOA transactions, not Safe internal deployment receipts.
3. Choose a **Treasury Admin** address: an EOA, multisig or MPC wallet. Contract deployment is not required. Provider Admin, Ops and Treasury must be distinct. Treasury is the shared payment-record writer; each service-name holder is its own payout recipient.
4. Complete provider setup below, publish a service, and send the confirmed provider name to the operator so its registry/resolver binding can be added to hosted Guard.
5. For the buyer demo, log in to Console and fund its displayed payer with **Base Sepolia USDC**. Sepolia gas and Base Sepolia USDC are different balances.

The operator can prepare infrastructure, tests and unsigned plans while wallet confirmation is pending. You do not need to create a Railway service for the default demo. Browser automation can fill forms and verify results; wallet prompts and login verification require the user.

### Observed setup on September 27, 2026

- Live Sepolia read: `ens402.eth` owner is `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`; child registry still zero at block 11787614. The owner had approximately 4.56 Sepolia ETH earlier in this check.
- Vercel has Privy, Intercepta, RPC and the existing account database.
- A separate empty hosted `ens402_discovery` database and dedicated `ens402_catalog` role are created. Discovery and analytics migrations passed; that role can read zero private account tables.
- Production `DISCOVERY_DATABASE_URL`, `ANALYTICS_DATABASE_URL`, all three embedding variables and `ENS_PARENT_NAME` are configured. A deployment is required to load changes.
- The local fixture database remains separate. The hosted connection is saved privately as `PRODUCTION_DISCOVERY_DATABASE_URL` in root `.env`; it is an operator convenience, not a runtime setting.
- Public catalog population, real Safe setup and public wallet transactions remain pending. The default synchronization host is the existing Next.js app on Vercel; Railway is optional.

## 1. Environment configuration

Put local values in the repository root `.env`. Never paste secrets into chat.

| Variable | What you supply |
| --- | --- |
| `PRIVY_APP_ID` | Your Privy application ID |
| `PRIVY_APP_SECRET` | That application's server secret |
| `SERVICE_ENS_NAME` | Optional comma-separated service suggestions; users may enter other supported ENS names |
| `ENS_OWNER_ADDRESS` | The wallet or Safe that owns that name and can set its resolver |
| `ENS_OPERATOR_ADDRESS` | A separate Ops wallet for endpoint, description and picture grants |
| `MERCHANT_PAY_TO` | HTTP 402 recipient; for schema v3 it must equal the current service-name holder, not automatically the Treasury writer |
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
7. Change payment terms using Treasury, or transfer a schema-v3 service name to change its recipient. Refresh ENS and obtain a new buyer approval. Replacing a Treasury writer alone does not change the recipient.

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

See the [remaining setup checklist](#remaining-public-demo-setup). The official current ENSv2 testnet app is https://app.ens.dev. The current SDK defaults to the official deployment pinned at source `71a3b733`; the older deployment remains an explicit `legacy` option for historical tests. Current key grants span all names within a resolver. The selected default is one resolver per provider with the same trusted writers; use separate instances for separate writer groups.

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

Ops and Treasury are freshly generated test-only wallets. Their keys are stored only in ignored root `.env` as `ENS_OPS_TEST_PRIVATE_KEY` and `ENS_TREASURY_TEST_PRIVATE_KEY`; the file is owner-readable/writable only. No roles have been granted and no transaction has been sent from them. The Admin key was not requested or copied. Funding these two writers does not fund the separate Base Sepolia USDC payer. The merchant HTTP challenge uses `MERCHANT_PAY_TO`; for schema v3 it must equal the current service-name owner. The demo Treasury EOA above is not the Safe required by shared-provider onboarding.

## Native contract roles

ENS official contracts enforce permissions. Interfaces only declare their ABI. Provider services now share a native PermissionedResolver when the same Ops and Treasury Admin manage them. Setter-key grants apply across every bundle in that resolver. The earlier direct-service flow still uses isolated resolvers.

| Wallet | Contract and scope | Native role |
| --- | --- | --- |
| Namespace owner | UserRegistry root | `ROLE_REGISTRAR` + `ROLE_REGISTRAR_ADMIN` |
| Registration worker or optional ServiceRegistrar | UserRegistry root | `ROLE_REGISTRAR` only |
| Service Admin | Service name | `ROLE_SET_RESOLVER`, `ROLE_SET_RESOLVER_ADMIN`, `ROLE_CAN_TRANSFER_ADMIN` |
| Provider Admin (shared mode), Service Admin (isolated mode) | Resolver root | `ROLE_SET_TEXT` + `ROLE_SET_TEXT_ADMIN` |
| Ops | Separate hashes of endpoint, description, avatar and ens402.call keys | `ROLE_SET_TEXT` |
| Treasury writer | Hash of `ens402.payment` key | `ROLE_SET_TEXT` |

Shared-provider setup requires three distinct identities: Provider Admin, Ops and Treasury Admin. The older isolated flow permits Treasury to equal Admin, which retains broader authority. A payout recipient gains no ENS role by receiving USDC. These are intended grants, not a live audit.

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

Fork and provider checks do not replace a public funded rehearsal. Provider registry and shared-resolver setup scripts are locally implemented and Anvil-tested. Catalog reconstruction and sync are implemented locally. Wallet onboarding and Admin handover planners are implemented and locally tested. Public namespace setup, worker operation and wallet rehearsal remain pending; see TODO.md.


## Provider namespace setup

`pnpm ens:provider:plan` builds artifacts and creates an unsigned, resumable plan.
Set `ENS_PARENT_NAME`, `PROVIDER_LABEL`, `PROVIDER_ADMIN_ADDRESS`,
`PLATFORM_REGISTRAR_ADDRESS` and `SEPOLIA_RPC_URL`. The platform child registry must already exist.
Sign each transaction with its indicated wallet; rerun after confirmation.
The provider receives its own native UserRegistry. No service text rights are inherited.

After linking, run `pnpm ens:provider:plan --with-service-registrar` to prepare a shared provider resolver and the
SharedProviderServiceRegistrar deployment. Shared mode also requires PROVIDER_OPS_ADDRESS
and PROVIDER_TREASURY_ADMIN_ADDRESS (three distinct Admin/Ops/Treasury identities). Use
--isolated-resolvers for separate per-service resolvers. Set `PROVIDER_SERVICE_REGISTRAR_ADDRESS`
from its receipt, then rerun. The planner verifies runtime bytecode and constructor
settings before preparing its ROLE_REGISTRAR grant and six specific initialization setter grants: endpoint, description, avatar, ens402.call, payment and status. Ops receives the first four; Treasury Admin receives payment. Neither delegate gets text-administration rights. Provider Admin retains root text writing and regrant authority. Never grant the permissionless
base ServiceRegistrar to a company registry. Publication requires the caller's live
ROLE_REGISTRAR in that same registry. No command above broadcasts transactions.

Local rehearsal: `pnpm exec tsx scripts/ens/provider-plan-fork.ts` uses disposable Anvil.
This does not complete public setup or prove ancestor emancipation.

## Discovery database, indexer and worker

`GET /api/discover`, `/discover`, SDK `discover()` and the read-only `/api/mcp` share the same catalog. The preferred source is `DISCOVERY_DATABASE_URL`; `DISCOVERY_CATALOG_PATH` is an explicit snapshot alternative. Missing/stale catalogs return 503. Results retain ENS source, block/hash and call metadata; they never authorize payment.

### Keep three data scopes separate

| Scope | Configuration | Use |
| --- | --- | --- |
| Accounts and payments | `DATABASE_URL` | Existing Neon account ledger; do not replace it with discovery settings |
| Local fixture discovery | Local `DISCOVERY_DATABASE_URL` | `pnpm discovery:local` provisions isolated local PostgreSQL; current fixture source is for development |
| Public chain discovery | Separate Neon database and role in hosted `DISCOVERY_DATABASE_URL` | Start empty, migrate, and bind to the configured live catalog source/roots |

The sync rejects source/root changes. Do not point the live worker at the fixture database, overwrite the account database, or upload a localhost URL to Vercel. The indexer must not receive account-ledger access.

```sh
pnpm discovery:local
pnpm discovery:migrate
```

For hosted discovery, provision a separate Neon database and least-privileged application role, inject its URL into the migration/worker/API environment, and run `pnpm discovery:migrate` against that database. Environment changes require redeployment. No hosted discovery database is verified by the local tests.

### Index and reconstruct

```sh
npm ci --prefix indexer
cd indexer
npm run codegen
npm run typecheck
npm test
npm run dev
```

Envio 3.12.1 watches the pinned Sepolia factory/root from block 11700000 and discovers native registries/resolvers dynamically. Factory discovery covers initializer logs earlier in the same block. Raw events retain registration, links, mutable token IDs, role and record changes; rollback is enabled. Configure an Envio HyperSync token or supported RPC source and the host's database requirements. Local `dev` needs Docker. A bounded Sepolia RPC run completed locally and its Hasura IndexedHead query succeeded; this is not a full-history or hosted deployment test. Default HyperSync requires `ENVIO_API_TOKEN` from https://envio.dev/app/api-tokens. Hosted Envio/GraphQL ingestion remains an external setup and verification step. The default demo uses a bounded Next.js synchronization route triggered by the merchant Refresh listings button. Vercel does not run the indefinite worker loop. A persistent Railway/Render/VM worker and hosted Envio remain optional for larger workloads.

From repository root, set:

| Setting | Meaning |
| --- | --- |
| `SEPOLIA_RPC_URL` | Historical state and log access |
| `INDEXER_ROOTS` | Comma-separated supported roots, after owner setup |
| `INDEXER_FROM_BLOCK` | Before those registries were created; a late bound can omit names |
| `DISCOVERY_DATABASE_URL` | Separate catalog database |
| `ENVIO_GRAPHQL_URL` | Optional Envio journal source; without it, reconstruct registration candidates from RPC logs |
| `ENVIO_GRAPHQL_ADMIN_SECRET` | Server-only authentication if required by that endpoint |
| `INDEXER_POLL_SECONDS` | Serial refresh interval, default 60 |

```sh
pnpm exec tsx indexer/src/export.ts /tmp/catalog.json
pnpm exec tsx scripts/discovery-sync.ts /tmp/catalog.json
pnpm exec tsx indexer/src/worker.ts --once
pnpm exec tsx indexer/src/worker.ts
```

The exporter uses finalized state; optional `INDEXER_TO_BLOCK` selects an earlier finalized block. It checks current owners, ancestor expiry, pointers, explicit records and metadata at that block, then rechecks its hash. Envio supplies candidates when configured, and must be caught up. RPC reconstruction also recovers names and records created before linking. Completed snapshots replace the catalog atomically; failed refreshes retain the previous snapshot. This is bounded reconstruction, not global ENS coverage.

A discoverable service needs valid fixed-price `ens402.payment`, active/suspended status and public `ens402.call` JSON with method and optional schema/examples. Invalid records are reported as exclusions; RPC errors abort export. The worker periodically removes expired/deleted listings even when no expiry event fires.

Local proof: `pnpm exec tsx indexer/src/fork.ts` tests native setup/registration, independent same-block reconstruction, pre-link records, updates, rollback and expiry, then real isolated PostgreSQL search/removal. Envio handler tests do not prove a hosted GraphQL endpoint.


Shared mode configuration: set `PROVIDER_ENS_NAME`, `PROVIDER_REGISTRY_ADDRESS`,
`PROVIDER_RESOLVER_ADDRESS` and `PROVIDER_SERVICE_REGISTRAR_ADDRESS` from verified receipts.
The registration page then checks the selected shared resolver and native publisher authority.
`PROVIDER_OPS_ADDRESS` and `PROVIDER_TREASURY_ADMIN_ADDRESS` prefill existing delegates;
registration must validate live permissions, not grant new ones. Treasury Admin is a payment-key
writer across all services. Schema-v3 recipients follow each service name owner. Contract code
presence does not prove Safe identity or threshold; verify the actual Safe before public use.

### OpenAI embedding configuration

Set these server-only values in root `.env`; copy the same values to the Vercel project and the indexer worker when deploying. Never use `NEXT_PUBLIC_`.

```dotenv
DISCOVERY_EMBEDDING_API_KEY=<your OpenAI API key>
DISCOVERY_EMBEDDING_ENDPOINT=https://api.openai.com/v1/embeddings
DISCOVERY_EMBEDDING_MODEL=text-embedding-3-small
DISCOVERY_QUERY_EMBEDDINGS_PER_MINUTE=60
```

Local OpenAI vector generation is verified: three fixture vectors persisted, with zero failures. This does not verify hosted configuration or real merchant results. The implementation reads `DISCOVERY_EMBEDDING_API_KEY`, not `OPENAI_API_KEY`. All three provider fields must be set together. Run `pnpm discovery:embed` after catalog synchronization, then `pnpm discovery:check`. Restart local development or redeploy Vercel after changing environment variables. Keyword search remains available without an embedding provider.

## Provider onboarding and merchant management

1. The owner enables the Platform Registry beneath `ens402.eth` directly in `/provider` using **Platform owner setup**. The unsigned `ens:namespace:plan` script remains an alternative. Both require the current owner wallet to sign.
2. Open `/provider`, connect Provider Admin, and enter a provider label, Platform registrar signer, Operations wallet and Treasury Admin. The page reads actual native state and presents one wallet-signed transaction at a time. Switch to the stated signer when requested. Setup progress is stored locally and revalidated onchain.
3. Once registry, shared resolver and restricted registrar are verified, publish service description, optional image, endpoint, fixed USDC price and call metadata in the same page. New shared-provider registrars publish with one transaction and no commitment delay. Older deployed registrars retain their original two-transaction flow. The registering wallet becomes the service-name holder and initial recipient.
4. After the registration receipt, `/merchant?provider=<name>&service=<name>` checks live membership, ownership, effective writers and listing status. `awaiting-index` is distinct from `listed`. Permissions are public observations, not authenticated account data; edits require the connected wallet to sign native transactions.
5. Replace Ops/Treasury in the merchant permissions control. Native resolver multicall grants the incoming writer and removes the outgoing writer atomically. Unexpected broad/root permissions stop the operation. Shared resolver scope covers every service bundle. Treasury replacement does not change the recipient.
6. For Admin handover, the incoming wallet accepts the exact target scope first. The outgoing wallet grants the incoming native authority and transfers the name; the incoming wallet then removes outgoing root rights. Reopen and continue after each receipt. Shared service-name transfers preserve provider resolver governance. Isolated services require the resolver administration handover too.

CLI alternatives: `pnpm ens:manage rotate|verify-rotation|acceptance|handover <public-input.json>`. Input types are exported from `@ens402/sdk/ens/management`. Plans contain unsigned transactions and never broadcast. Acceptance is a planner requirement, not a new ENS contract restriction. Parent powers, third-party grants, alias/link and upgrade authority are outside this bounded handover.

## Holder-derived payment records

New current-ENS registrations publish:

```json
{"version":3,"recipient":"name-owner","scheme":"exact","network":"eip155:84532","asset":"0x036cbd53842c5426634e7929541ec2318f3dcf7e","pricing":{"model":"fixed","amount":"10000","unit":"request"}}
```

The SDK derives internal `payment.payTo` from the live service owner. Do not copy that derived field back into the ENS record; use `serializePaymentRecord()`. Legacy v1/v2 explicit-recipient records remain readable. A name transfer changes the v3 recipient and invalidates previous authority-bound buyer approvals. Treasury controls price and terms, not ownership.

Standalone SDK integrators must resolve current ENS state and call `checkNameOwnerRecipient(ensClient, baseClient, service)` before `verifyRequest` and signing. The reference server does this in `inspectService`. Destination evidence older than 30 seconds is rejected. No bridge is involved.

For an EOA, code absence on both chains is an eligibility check; it does not prove someone holds the key. For a contract holder, deploy the intended wallet on Base Sepolia and sign the exact service/chain/owner/expiry message:

```sh
pnpm recipient:proof <service-name> <holder-address> <future-unix-seconds>
```

Add `controlProof: { "validUntil": <seconds>, "signature": "0x..." }` to the v3 record using its authorized payment writer. Guard checks the signature on Base Sepolia. Safe owners/threshold and actual message signing must be rehearsed using the real Safe; the local ERC-1271 fixture is not a Safe audit.

## Address-level analytics

Configure `ANALYTICS_DATABASE_URL` on the worker and web app. It may use the public discovery database, but must be separate from the private `DATABASE_URL` ledger. Set `ANALYTICS_FROM_BLOCK` to the intentional Base Sepolia scan start, then run `pnpm analytics:migrate`. `discovery:watch` runs the scanner after successful catalog synchronization; analytics failures preserve discovery and retry later.

Optional `ANALYTICS_FACILITATORS_FILE` is a reviewed JSON file: `{ "version": "reviewed-v1", "network": "eip155:84532", "addresses": [] }`. No facilitator addresses are guessed. Transfers are unclassified by default; a known transaction sender supplies only a facilitator heuristic. Independently verified settlements have a separate category. The dashboard shows checkpoint, observation windows and integer USDC totals, grouped once per recipient. Name/address epochs preserve history, and shared addresses are not duplicated across services.

Hosted discovery database setup is complete. Public launch still requires verified namespace/provider setup, a successful scheduled sync, real Safe configuration and a funded buyer rehearsal.

For the worker's verified category, set `ANALYTICS_LEDGER_DATABASE_URL` to a read-only credential for the ENS402 account database, or use the worker's existing `DATABASE_URL`. Only terminal local payment evidence is eligible; every match is independently checked against finalized chain receipts. No public route accepts evidence submissions or exposes the ledger. A feed outage leaves transfers conservatively classified and retries later.

### Hosted provider trust groups

After onboarding, configure the confirmed `PROVIDER_ENS_NAME`, `PROVIDER_REGISTRY_ADDRESS` and `PROVIDER_RESOLVER_ADDRESS`. Additional providers can be added through `PROVIDER_GROUPS_JSON`, an array of `{providerName,providerRegistry,resolver}`. Hosted Guard and Admin handover use these operator-reviewed pins; publishing/indexing alone does not add a provider to that trust set. SDK integrators can supply their own resolver policy. This admission step is currently manual, and unknown provider groups are held.

For a reviewed isolated service resolver only, set `ENS_MANAGEMENT_RESOLVER_POLICY=dedicated` to enable its separate governance handover. A one-bundle count is a check, not proof of exclusive resolver membership. Shared provider governance requires its configured registry/resolver binding; a service-name handover never implicitly transfers that shared governance.

When Solidity sources change, run `pnpm provider:artifact` and commit the regenerated public deployment artifact. Hosted web builds verify its source digest without requiring Forge.

## Default: synchronize inside Next.js

For the demo, an authenticated merchant clicks **Refresh listings**, which calls `POST /api/discovery/sync` in the existing Next.js app. There is no cron schedule or separate host to configure. The API uses a database lease and cooldown, and configured roots only. A bounded run reconstructs finalized ENS state, publishes a complete catalog and updates description embeddings. It never signs a transaction. Errors retain the previous catalog; stale search results still fail freshness checks.

Set `INDEXER_ROOTS=ens402.eth`, `INDEXER_FROM_BLOCK=11700000`, the hosted catalog/embedding values and the existing Sepolia RPC on Vercel. Analytics starts at Base Sepolia block `47337056`; earlier transfers are outside this observation window. These values are configured for this project. No Railway login or Envio deployment is required for the initial demo. A newly mined registration can remain `awaiting-index` until Sepolia finality; manual refresh cannot bypass that delay.

## Optional: deploy the persistent discovery worker

Build from the repository root:

```sh
docker build -f indexer/Dockerfile.worker -t ens402-discovery-worker .
```

On Railway, Render or a VM, run this image as one persistent background worker. No HTTP port is needed. Environment values are injected by the host; the image contains no `.env` or private key. Migrate the hosted database separately before starting it.

| Worker variable | Value/source |
| --- | --- |
| `DISCOVERY_DATABASE_URL` | The hosted public catalog connection, same database as the web API |
| `SEPOLIA_RPC_URL` | Existing Sepolia historical-state/log RPC |
| `INDEXER_ROOTS` | `ens402.eth`, after its namespace is initialized |
| `INDEXER_FROM_BLOCK` | `11700000`, before native registrations in this deployment |
| `INDEXER_POLL_SECONDS` | `60` |
| `DISCOVERY_EMBEDDING_API_KEY`, `DISCOVERY_EMBEDDING_ENDPOINT`, `DISCOVERY_EMBEDDING_MODEL` | Same configured embedding provider as web |
| `ANALYTICS_DATABASE_URL` | Hosted public catalog database, if enabling analytics |
| `BASE_SEPOLIA_RPC_URL`, `ANALYTICS_FROM_BLOCK` | Existing RPC and an explicit scan-start block before demo payments |
| `ENVIO_GRAPHQL_URL`, `ENVIO_GRAPHQL_ADMIN_SECRET` | Optional hosted Envio journal. Without it the worker reconstructs from RPC logs |

Run one cycle with `node_modules/.bin/tsx indexer/src/worker.ts --once` before enabling the default continuous command. Verify finalized checkpoints and a real service listing after registration. `ANALYTICS_LEDGER_DATABASE_URL` is optional and must be a separate read-only account-ledger credential if verified local settlement classification is needed. Do not give private account credentials to Envio.

## Endpoint metadata required by new publication

The endpoint must return an unsigned x402 HTTP 402 challenge containing `resource.description` and the **ENS402 application extension** below. This is our supported metadata format, not a claim that it is part of official Bazaar. Automatic import of arbitrary OpenAPI/Bazaar formats is not implemented.

```json
{
  "extensions": {
    "ens402.service": {
      "version": 1,
      "call": {
        "verification": "ens402.service.v1",
        "method": "GET",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": false},
        "outputSchema": {"type": "object", "properties": {"result": {"type": "string"}}, "required": ["result"]}
      }
    }
  }
}
```

`metadataExtension(description, call)` from `@ens402/sdk/metadata` constructs this extension. The same call object is published in `ens402.call`. Descriptions are trimmed and limited to 1024 UTF-8 bytes; call metadata is limited to 16384 bytes. Both schemas are required for verified publication. Key order does not matter, array order does; `$ref` and nesting beyond the supported limit are rejected. This checks declared metadata consistency, not whether actual service output follows the schema.

The registration page inspects the endpoint, lets the merchant review proposed values, and rechecks metadata/payment equality before both commit and reveal. Editing any field discards the pending draft. Guard pins verified metadata in buyer approval and rejects later changes or removal before signing. Legacy records lacking the verification marker retain their existing payment checks but do not gain a metadata-verification claim.

Treasury Admin is a payment-settings role, not a wallet type. `PROVIDER_TREASURY_ADMIN_ADDRESS` is the preferred variable; the previous `PROVIDER_TREASURY_SAFE_ADDRESS` remains accepted as a compatibility alias. The registrar ABI retains its legacy `treasurySafe()` getter; it does not require contract code.

## Optional Curvegrid MultiBaas activity feed

Set `MULTIBAAS_BASE_URL`, `MULTIBAAS_API_KEY`, `MULTIBAAS_ENS_REGISTRY_ADDRESS` and `MULTIBAAS_ENS_RESOLVER_ADDRESS` as server-only variables. For this demo, the addresses are the native `ens402.eth` child Registry and parent Resolver on Ethereum Sepolia. Run `pnpm exec tsx scripts/multibaas-setup.ts` once to register their event ABIs and link the contracts. The script checks chain ID 11155111. On the free plan, set `MULTIBAAS_START_BLOCK=-80` for an initial window within its 100-block backfill cap. Add the four runtime variables to Vercel Production and redeploy to enable the public feed. Never use a `NEXT_PUBLIC_` prefix for the API key.

`GET /api/governance/activity?kind=Registry|Resolver` and MCP `observe_ens_changes` return bounded, read-only event observations. This initial link does not cover every provider Registry or shared Resolver. An empty page means there were no events in the indexed window, not that no ENS changes ever happened. Guard and native EAC checks always use fresh ENS state rather than this index.

### Replace the older provider publisher

On the verified provider publication screen, choose **Set up one-transaction publishing**. Finish any pending legacy registration first. The owner-driven sequence deploys the new registrar, verifies its compiled runtime and bindings, grants its six native record setters and registration permission, then revokes the previous registrar's registration role and six record setters. It preserves the provider Registry, shared Resolver, existing names and human delegates. Each step is simulated and receipt-checked, and saved progress resumes without resubmitting a confirmed transaction. These setup signatures happen once; subsequent service publication uses one transaction. The older general-purpose ServiceRegistrar still uses commit/reveal for compatibility and open registration.

### Fewer setup signatures and current role holders

Provider setup uses native multicall for consecutive permission updates on the same verified Resolver. A complete legacy-publisher replacement normally takes five transactions: deploy, grant six resolver setters, grant new registry registration permission, revoke old registry registration permission, revoke six old resolver setters. Already-completed steps are skipped. Wallets need not be Safe accounts. This is native contract batching, not a third-party MultiSend contract.

In the merchant service card, open **Permissions and ownership**. Permissions shows live Resolver Admin, Operations and Treasury Admin holders. The current wallet is read-only; if multiple narrow holders exist, select from verified on-chain holders. Enter only the new wallet. Replacing a delegate grants and revokes the selected keys in one transaction and affects all services sharing the resolver. Ownership is a separate tab. The demo reader scans at most 200,000 blocks of complete resolver history and fails closed when it cannot verify holders.
