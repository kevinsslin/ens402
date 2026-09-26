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

The worker has issuer authority within one namespace. Parent administrators retain their native powers. The SDK protects cooperating signing flows; backend credentials and unrestricted private keys remain trust boundaries. This earlier payment audit did not prove indexer reconstruction or the provider hierarchy; their subsequent local evidence is recorded below. Version aliasing remains deferred.

## Follow-up: units, fields and observed roles

- Read the pinned Base Sepolia USDC contract at block 47327295: `decimals() == 6`. A displayed `0.01 USDC` becomes integer `10000`; ENS `pricing.amount`, HTTP 402 `amount` and the authorization `value` use atomic units. Chain, token contract and recipient must match before amount comparison. Other assets are rejected; arbitrary token decimals are not inferred from their symbols or HTTP metadata.
- Added a contract-decimals assertion to the dual-Anvil test. Added atomic-vs-display, wrong-network/token and UTF-8 boundary tests. Latest suites pass: 98 unit, 28 PostgreSQL integration, 32 Solidity fork tests, complete Anvil, typecheck and production build.
- `/register/example` reuses the real form with editable placeholder values and signing disabled. Description is required for new registrations and limited to 1024 UTF-8 bytes. Picture is optional; HTTPS endpoint/picture URLs are limited to 2048 bytes, including their normalized encoded form. The form displays the description byte count and human-to-atomic price conversion.
- `pnpm ens:permissions:check` resolves the configured service and checks Admin/Ops/Treasury effective text permissions at a recorded block, including unwanted root and text-administration rights. Missing configuration fails closed. Actual fork tests verify the audit fails for accidental Ops root grants and missing required grants, then passes after correction. It does not enumerate all holders or prove absence of ancestor/upgrade authority.
- Fresh public read at Sepolia block 11786000 still shows `ens402.eth` has no child registry. Public grants remain unverified; native-only setup is still required.
- Fresh Intercepta test at 2026-09-26T11:35:40Z returned `toxicScore: 0, traits: []`; the second request used cache. This address API supplies Ethereum-mainnet attribution, not a Base Sepolia scan or service-quality guarantee. Blocking/malformed/unavailable cases are separately tested with fixtures.
- The three functional layers are Discover (read), Govern (native authorization during writes), Guard (pre-signing verification). The platform/provider/service tree is a separate core namespace organization. Its later contracts/scripts and shared-resolver evidence are recorded below; public owner setup remains pending.
- Arbitrary `.eth` registration is not implemented by the paid merchant. It would integrate the official ETHRegistrar with availability, rent quotation, duration, payment-token funding/allowance and commit/reveal recovery. A service's ENS identity and the namespace of names it sells are separate choices; ENS402 does not require merchants to sell our subnames.


## ENSv2 subname scope review, September 26

Reviewed the complete official [Exploring Subnames in ENSv2](https://ens.domains/blog/post/exploring-subnames-ensv2)
article and pinned native source at `71a3b7339dbc55ab47667abdfe8303bac4f4c24e`.

- A registry represents ownership and per-name pointers. A resolver represents record bundles and writer scope. Registries are useful for independent ownership OR separate resolver routing; reserved entries can route without minting tokens.
- Key grants span all names on one resolver. Five new native fork tests prove cross-name writes, cross-resolver isolation, denied other-key/delegation writes, per-name default fallback, shared linked bundles and action regrant through retained admin rights.
- Shared-provider SDK policy pins the provider name, actual parent registry and resolver, and requires an exact positive record ID. Record count can grow without invalidating other service approvals. Dedicated compatibility retains its one-record check, which cannot prove exclusive use because aliases may share bundles. Shared registration creates separate bundles and grants no resolver administration to publishers.
- Initial platform/provider registry grants are registrar and registrar-admin only. They do not automatically grant pointer/text/upgrade control. Parent-name pointer powers and expiry remain separate trust paths; no emancipation claim or public renunciation was made.
- The permissionless ServiceRegistrar is inappropriate for a company namespace. Added ProviderServiceRegistrar, requiring the caller's live native ROLE_REGISTRAR at reveal. Tests cover unauthorized callers, revoked publishers, sibling authority and preservation of the public registrar flow.
- Added IServiceRegistrar and NatSpec while preserving external ABI. Added commitment age/expiry tests.
- Provider setup now includes verified restricted registrar deployment/grant planning. Disposable-Anvil rehearsal runs the actual TypeScript plan through deployment, resume, link, runtime/settings verification, grant and completed rerun.
- Discovery foundation includes snapshot Search API, configurable SDK client, keyword/name/atomic-price filters and embedding transport with hash invalidation. This was an earlier foundation-only checkpoint. Subsequent indexer, persisted search and Console work is recorded below; public hosting remains pending.

Earlier baseline validation: 110 unit tests, 47 native Solidity fork tests and full workspace typecheck passed. Shared-provider additions are validated separately below. Provider planner Anvil smoke passed. No public contract deployment, grant, revocation or payment was submitted. Database integration/payment flows were not changed or rerun in this scope.

### Shared provider resolver validation

- Selected default: one native resolver per provider, separate record bundles per service. Ops and Treasury Admin (Safe) are delegated key writers; the title does not imply ROLE_SET_TEXT_ADMIN. The payment key contains price, asset, network and payTo, so its writer controls the entire tuple. Provider Admin retains root text and text-administration authority.
- SharedProviderServiceRegistrar requires live publication authority and current native delegate permissions, rejects existing or linked bundles, and grants no resolver root authority to publishers. Delegate rotation does not require redeploying the registrar. The registrar retains six scoped initialization setter grants, including ens402.call; its entry points constrain their use.
- Final local validation: 122 unit tests and 53 native Solidity fork tests passed, along with SDK/server/web typechecks and the Anvil-script TypeScript check. Public shared-provider deployment and actual Safe owners/threshold/execution are still pending. No public transaction was sent.


## Discovery and provider update, September 27

Evidence below is local or explicitly credential-scoped; it does not establish public contract deployment or hosted indexer operation.

- Envio 3.12.1 code generation, typecheck and generated-handler/journal tests passed. Native registry/resolver discovery includes same-block initializer logs; rollback is enabled. A hosted Envio database and GraphQL bridge remain unverified. Local OrbStack Docker ran Envio against a bounded Sepolia RPC range, blocks 11783980 through 11783987. Hasura reported IndexedHead 11783987 and journalCandidates succeeded with zero registrations in that range. This verifies runtime/GraphQL connectivity, not full-history ingestion. Default HyperSync requires ENVIO_API_TOKEN.
- Native Anvil reconstruction passed: unsigned fixture plan, commit/reveal registration and indexed fixture; independent snapshots at one block; record initialization before linking; updated records; reverted-fork rebuilding; and expiry without an event. Resolver reads go through UniversalResolver.resolve, not direct text calls.
- Temporary isolated PostgreSQL tests synchronized real reconstructed catalogs, returned keyword results, retained checkpoint evidence and removed expired services. Source/root identity is fixed per database; finalized snapshots fail closed on conflicting checkpoint/time rather than silently accepting a rollback.
- Search API, SDK, buyer discovery UI and read-only MCP are implemented. Public catalog availability still depends on owner setup, a populated hosted discovery database and running synchronization.
- Local OpenAI `text-embedding-3-small` generation completed 3, failed 0, producing three persisted fixture vectors. The live query "Convert dollars into euros" returned the currency fixture with a semantic-only score of approximately 0.420. Its fixture ENS label was subsequently changed from fx to rates while retaining the /fx endpoint. No claim is made here about live merchant rankings or hosted OpenAI configuration.
- Default shared-provider setup grants Ops four key writers: endpoint, description, avatar and ens402.call. Treasury Safe controls the payment key. The shared registrar receives six initialization setters including status, while Provider Admin retains root text and text-administration governance. Public Safe owners/threshold/execution and public grants remain unverified.

The persistent local discovery database is a labeled fixture source, separate from the account ledger. A new empty Neon database/role is required for the live chain source; reusing the fixture database for a different source is rejected. Setup commands are consolidated in SETUP.md.

Latest root-agent receipts for this revision: 135 fast tests, 12 web tests, 11 discovery database tests, and 3 indexer tests passed; Envio codegen/typecheck, workspace typecheck and Anvil-script typecheck passed. The native discovery fork and optimized production build passed. Live semantic verification also ranked weather first for "Will I need an umbrella tomorrow?" and rates first for "Convert dollars into euros" without keyword matches. Whole-word matching and stopword filtering prevent English short words from creating spurious hits; positive cosine similarity ranks semantic suggestions, not confidence or quality guarantees.

## TODO implementation completion, September 27

This round adds wallet-driven provider onboarding and merchant management, native delegate/Admin transitions, holder-derived recipients and classified address analytics. It does not perform public owner transactions or claim a funded public walkthrough.

- `/provider` prepares resumable wallet-signed native registry, shared resolver and registrar setup. Service publication validates public call metadata and probes actual unsigned HTTP 402 terms using authenticated, SSRF-safe transport before commit/reveal.
- `/merchant` checks live provider membership, owners and effective roles; publication receipt and searchable listing are separate states. Public observations do not authenticate an arbitrary wallet address. Mutations still require native wallet signatures.
- Native resolver multicall replaces scoped writers atomically. Postchecks must explicitly pass. Unexpected root/admin rights, unknown role values and a wrong outgoing delegate are rejected. Admin handover binds incoming acceptance, live registry pointers and configured resolver scope; a shared resolver cannot be silently transferred as service-only governance.
- Schema v3 stores `recipient: name-owner`, with no stored payTo. Fresh ENS ownership determines the recipient; authority changes invalidate approvals. Contract holders require deployed Base Sepolia code and direct ERC-1271 magic-value verification at a pinned block. Generic signature verification with EOA fallback is deliberately not used for this check. The contract fixture verifies ERC-1271 behavior, not actual Safe owners/threshold.
- Analytics indexes finalized Base Sepolia USDC receipts, groups each shared address once, preserves name/control/address epochs and replays canonical checkpoints. Separate unclassified/facilitator/verified totals prevent treating all transfers as x402 revenue. Worker-only terminal ledger evidence is independently checked against Transfer, AuthorizationUsed, amount, payer, recipient, nonce and finalized canonical receipt.
- Additional hosted provider groups require explicit verified configuration. Registration/indexing does not silently expand the hosted Guard trust set. This manual admission boundary remains documented in SETUP.
- The public registrar bytecode artifact is generated from Forge output. Hosted builds verify its source digest, preventing unnoticed source/artifact drift.

Validation this round:

| Check | Result |
| --- | --- |
| `pnpm test` | 143 tests passed |
| Web onboarding, endpoint probe and existing route tests | 21 tests passed |
| Discovery PostgreSQL | 11 tests passed |
| Analytics PostgreSQL, readonly ledger proof feed and local Anvil scanner | 13 tests passed |
| Envio codegen/typecheck/handler tests | Passed; 3 tests |
| Full native Solidity suite | 55 tests passed |
| `pnpm test:anvil` | Passed, including actual USDC/ENS dual-fork flow and 28 ledger/workflow tests |
| Discovery/provider fork | Passed: native commit/reveal, PostgreSQL ingestion, independent reconstruction, update/rollback/expiry |
| Native management fork | Passed: replacement, broad-right rejection, accepted staged Admin handover and final authority checks |
| Recipient fork | Passed: native v3 owner resolution/transfer, prior-approval rejection and destination ERC-1271 proof |
| TypeScript and production build | Passed locally; final deployment receipt is separate |
| Browser | Provider/merchant sign-in gates and editable service example loaded; 390px form had no horizontal overflow |

The browser verification did not sign in as the real owner or execute wallet transactions. Hosted ingestion, public grants, Safe execution and a funded buyer purchase remain explicit TODO items. Ancestor/root/link/upgrade powers are not renounced and exclusive resolver membership is not claimed.
