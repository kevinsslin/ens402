# ENS402 implementation audit

Updated 2026-09-26. Scope: SDK, hosted API, merchant, console, native ENS setup and custom registrar. This is an engineering review with executable tests, not an independent security certification.

## Implemented in this revision

- ENS payment schema v2 publishes a positive fixed USDC amount per request. The SDK compares it with the actual HTTP 402. Buyer approvals bind the displayed fixed price; changed prices or a downgrade to legacy schema require renewed approval.
- Native records `description` and optional HTTPS `avatar` are read, validated, displayed and editable. New service registration publishes them and grants Ops their individual text-key permissions. Treasury controls the payment key; Admin retains root text administration.
- `POST /api/merchant/register` sells a native Sepolia subname under the configured parent, directly to the requested recipient. It does not buy arbitrary second-level `.eth` names. It creates no resolver and retains no resolver administrator rights.
- The SDK supports bounded JSON POST orders. An ENS402 application convention binds the endpoint and exact body to the signed EIP-3009 nonce. Every order includes a UUID v4. Ordinary x402 clients must implement this binding to use this endpoint; this is not a universal x402 requirement.
- Managed and self-signing paths support these orders. The console exposes label/recipient inputs and the agent SDK accepts `request`.
- Registration orders persist the original payment authorization, requirement, registry and expiry. The worker saves a signed ENS transaction before broadcast and may only resend those identical bytes. It serializes signing with a PostgreSQL transaction advisory lock and stops nonce allocation while another registration is unresolved.
- Additive PostgreSQL migration adds the order ledger. No existing tables or user data are deleted.

## Important findings and fixes

| Finding | Resolution |
| --- | --- |
| Existing ENS payment records had no price | Versioned fixed-price schema, SDK checks and explicit legacy compatibility |
| Buyer amount cap was not consent to a displayed fixed price | New fixed-price approvals bind that price and reject schema downgrade |
| Description and picture existed only in design | Native record publication, scoped grants, console controls and validation |
| A normal name transfer leaves the old resolver administrator in control | Paid name purchase registers directly to recipient with no resolver; service transfer caveat remains documented |
| x402 payment signature alone does not commit to arbitrary request input | POST order endpoint/body hash is the signed nonce; tampered recipients/labels are rejected |
| Payment and registration span two chains | Durable paid/pending/fulfilled states, separate receipts, explicit recovery without a second charge |
| Worker crash or concurrent requests could reuse a transaction nonce | Persist signed transaction, transaction-scoped worker lock, unresolved-transaction gate |
| Local configuration was being confused with public readiness | Fresh chain read and production variable inventory; exact missing setup below |

## Validation

- Fast unit suite: fixed-price mismatch, malformed amounts, price reapproval, schema downgrade, metadata validation and cryptographically checked request binding, plus existing checks.
- PostgreSQL integration: ownership isolation, budgets, idempotency, managed/self signing and paid registration with simulated external providers. Tampered orders never reach settlement; replay returns the saved result.
- Native Solidity forks: actual official ENS contracts, grants/revocation, metadata and fixed-price publication, commit/reveal, callback reentrancy, isolated resolvers, recipient ownership and recipient configuration rights.
- Dual Anvil: actual ENS and Base Sepolia USDC code. The request-bound purchase settles USDC, then invokes the production native registration gateway and confirms recipient ownership. Local signer, screening and facilitator adapters are used.
- Live Intercepta scan and cache check passed. Live Privy signature verification and seven policy-denial checks passed, followed by deny-all restoration. No wallet was funded and no public payment was submitted by those provider tests.
- Final local results: 96 unit tests, 28 PostgreSQL integration tests and 32 Solidity fork tests passed. The complete dual-Anvil suite, TypeScript checks and Next.js production build passed. Public docs were checked at desktop and 390px mobile widths without horizontal overflow; the registration page correctly shows setup pending. Authenticated public purchase UI remains unverified until namespace setup and funding.

## Deployment inventory

| Component | Existing ENS infrastructure or ours? | Public deployment needed? |
| --- | --- | --- |
| Root/ETH registry, Universal Resolver, VerifiableFactory, implementation contracts | Official ENSv2 | Reuse pinned Sepolia deployment |
| UserRegistry instance beneath `ens402.eth` | Official ENS contract, configured for this namespace | Yes, create an instance and set the parent pointer once |
| PermissionedResolver instance for the paid service itself | Official ENS contract | Yes, publish the API's description, endpoint, price and recipient; grant Ops/Treasury |
| `ServiceRegistrar.sol` | Our optional commit/reveal onboarding contract | Only for `/register`, which configures complete services and their delegated resolvers |
| Paid name purchase worker | Our backend using native `register` | No additional custom contract; needs narrow registrar authority and testnet gas |
| Interfaces and role/deployment libraries | ABI declarations and constants | No deployment |
| `NativeENS.sol` | Compatibility import only | No deployment |

`pnpm ens:namespace:plan --native-only` generates the minimum unsigned setup plan for the paid name service. It creates an official UserRegistry instance and points the parent to it. The final grant assigns only `ROLE_REGISTRAR` to the dedicated worker. Running without `--native-only` also prepares the optional ServiceRegistrar deployment. Plans do not send transactions.

## Confirmed outstanding setup

At Sepolia block 11785763, `ens402.eth` belongs to `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`, but its child registry is zero. Parent registration alone does not enable subname issuance.

Production variable names confirm Neon, Privy, Intercepta and both RPCs are configured. The namespace, service and purchase-worker settings are not present. Set the values only after reviewing the actual transactions:

1. Parent owner executes the reviewed native namespace setup and grants a dedicated worker `ROLE_REGISTRAR`. Fund that worker with Sepolia ETH. Do not give it the parent Admin key or registrar-administration rights.
2. Configure `ENS_PARENT_NAME`, `ENS_PURCHASE_REGISTRY`, `ENS_PURCHASE_EXPIRY`, `ENS_REGISTRATION_PRIVATE_KEY` and `ENS_REGISTRATION_RESOURCE_URL`.
3. Register/configure a service name such as `buy.ens402.eth`. Publish `/api/merchant/register`, description and schema-v2 price/payment settings. Set `SERVICE_ENS_NAME`, `MERCHANT_PAY_TO`, `MERCHANT_PRICE_UNITS` and setup-only `SERVICE_DESCRIPTION`. Use `pnpm ens:plan` to prepare existing-service records and grants.
4. For full-service self-registration, separately deploy ServiceRegistrar and set `SERVICE_REGISTRAR_ADDRESS`. Its ABI now includes description, picture and price; an older instance cannot expose the new ABI.
5. Complete a real Privy browser login, approve the service and fund the displayed payer with Base Sepolia USDC. No mainnet funds.
6. Execute a public purchase and verify both the Base Sepolia payment receipt and Sepolia recipient ownership. This public funded run is still pending.

## Recovery and limits

`GET /api/merchant/registration-orders/<orderId>` returns public order status and transaction hashes, never signing keys, raw transactions or payment signatures. If payment succeeded but registration is pending, use the operator-only control action `recover-registration` with the original order ID and, if needed, its original Base Sepolia transaction hash. It independently verifies the original authorization before resuming. It never charges again.

Payment and name delivery are not atomic. A name can become unavailable or registration can revert after payment. Such orders require operator investigation and, if undeliverable, a manual refund. Automated refunds, name renewal, arbitrary `.eth` purchase, generic transfer/grant endpoints and autonomous background retries are out of scope. Recipient contracts must accept native ERC1155 transfers; preflight simulates registration before charging.

The worker has issuer authority within one namespace. Parent administrators retain their native powers. The SDK protects cooperating signing flows; backend credentials and unrestricted private keys remain trust boundaries. Indexer reconstruction, provider registry hierarchy and version aliasing remain separate planned work, not proven by this audit.
