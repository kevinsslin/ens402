# ENS402 remaining work

Single actionable backlog. Current implementation and evidence: [README.md](README.md) and [AUDIT.md](AUDIT.md). Exact operator inputs: [SETUP.md](SETUP.md). An unchecked item is not complete.

## 1. Discovery implementation

- [x] Implement Envio native event ingestion and finalized root-scoped reconstruction, including current pointer/record reads, expiry and reorg-aware rebuilding. Public hosting remains a setup item.
- [x] Demonstrate identical independent catalog reconstruction at the same Anvil block, including records written before linking.
- [x] Add persistent search records and PostgreSQL keyword indexes. Default payment asset: Base Sepolia USDC (`eip155:84532`, `0x036cbd53842c5426634e7929541ec2318f3dcf7e`, 6 decimals).
- [x] Implement isolated discovery PostgreSQL, atomic catalog synchronization and persistent embeddings. Current bounded ranking uses native arrays, not pgvector/ANN. OpenAI generated three persisted local fixture vectors; hosted Neon discovery verification remains pending.
- [x] Implement semantic ranking, metadata-change embedding updates, leases/retries, deletion, model rotation, stale-result rejection and query spend limits. Live OpenAI vector generation and a semantic-only currency query passed; hosted rollout remains a separate gate.
- [x] Implement snapshot Search API and configurable SDK discovery client with query, payment network, asset address, atomic price ceiling and result count. Ranking is relevance, not proof of quality. Live indexed catalog and operational semantic search remain unchecked below.
- [x] Connect `/discover` to SDK `discover()` and the persisted catalog API; selected names open Console for fresh inspection. Public chain catalog still requires setup.
- [x] Publish `ens402.call` in registration with explicit method and optional schema/examples. Ops holds its fourth key grant. Missing call metadata excludes a service from discovery.
- [x] Add read-only MCP `discover_services`/`resolve_service` and Skill discovery instructions.

## 2. Buyer and merchant journeys

- [x] Buyer results show ENS, description, match reason, USDC price, network, source/block/time and fixture status; API retains exact atomic prices. Relevance is separate from trust.
- [x] Service detail shows method, schema/input/output examples when published, curl probe and links to the approved SDK flow. Provider content remains untrusted.
- [x] Buyer can hand a candidate to Console, inspect fresh ENS and approve the existing Guard. Exact-URL GET and bounded JSON POST input are supported; POST requires ENS402 merchant request binding. Public funded rehearsal remains pending.
- [ ] Provider onboarding collects description, optional image, endpoint, fixed price, payout and Ops/Treasury delegates, then checks endpoint/call metadata before commit/reveal.
- [ ] After confirmed service registration, return to a merchant dashboard with states: draft, awaiting signature, registering, awaiting index, listed, suspended/expired or index error. Receipt confirmation alone does not mean searchable.
- [ ] Merchant dashboard lists controlled services with their current ENS records and actual edit permissions. Authenticate wallet control and check current onchain roles; a Privy login or payout address alone is not merchant administration.
- [ ] Keep store-to-service membership explicit and verifiable through the provider registry hierarchy below. Show service ownership separately from provider administration; do not infer company ownership or revenue attribution merely from a shared payTo.

### Operator inputs and remaining verification

- [ ] Treasury Safe address on Sepolia, with verified owners/threshold. Local shared-setup tests use a contract fixture, not a real multisig rehearsal.
- [x] Configure local OpenAI embeddings and generate persisted fixture vectors: `discovery:embed` completed 3, failed 0.
- [x] Verify live semantic matching: "Convert dollars into euros" returned the currency fixture without a keyword match.
- [ ] Configure hosted discovery credentials and a separate empty Neon database. Do not copy the local fixture catalog into the live source database.

### Core scope: provider hierarchy and native EAC management

The target hierarchy is Platform Registry -> Provider Registry -> service names with one shared resolver per provider and separate record bundles per service. Both registries use native ENS UserRegistry implementations. This is separate from the Discover/Govern/Guard functional layers. Provider onboarding is now core scope, not deferred work. User-selected default: shared provider resolver because the same team manages its services. Ops and Treasury Admin (Safe) are key-scoped delegated writers across all bundles. Treasury Admin is a business title, not an EAC admin-role grant. Use isolated resolvers for different writer groups.

Implemented this round: resumable unsigned provider setup, restricted ProviderServiceRegistrar using the caller’s live native ROLE_REGISTRAR, runtime/constructor checks before granting it authority, and a complete disposable-Anvil setup rehearsal. Shared-provider registrar and setup are implemented locally; Provider onboarding UI, role replacement and Admin handovers remain incomplete.

Existing baseline: ServiceRegistrar registration already makes the caller the service name owner and resolver text Admin, grants the supplied Ops address endpoint/description/avatar/call-metadata writes, grants the supplied Treasury address payment-record writes, and removes its own resolver bootstrap rights in the same reverting registration transaction. Delegate addresses are supplied, not automatically generated wallets. This is implemented/fork-tested, not publicly enabled. Paid bare-subname issuance does not configure a service resolver or these delegates.

- [ ] Execute and verify public platform initialization using the existing unsigned setup plan: deploy native Platform Registry, attach it to the parent name, configure the registration entry point and verify actual grants/pointers after owner-signed transactions.
- [x] Implement and Anvil-test the unsigned provider setup workflow: native Provider Registry, atomic provider-name ownership/pointer configuration, resumable stages and verification.
- [ ] Add wallet-driven Provider onboarding UI and confirm actual public setup; scripts/fork tests alone do not complete this journey.
- [ ] Connect service onboarding UI to the selected Provider Registry and restricted ProviderServiceRegistrar (contract and unsigned deployment/grant planning are implemented). Registration form now checks the shared resolver and publisher authority. Finish onboarding by reusing the provider resolver, initializing separate service bundles and reading live delegates. Make caller-as-name-owner explicit; a separate Admin recipient requires a deliberately implemented and tested handoff. Keep provider and service administration distinct.
- [ ] Build a Permissions view showing Platform Owner, Provider Admin, Service Admin, Ops, Treasury delegate and payTo separately, with contract/resource scope, effective native roles and observed block. Flag broader grants; role labels are not proof of permissions and grants do not automatically inherit through the name tree.
- [ ] Implement Replace Ops and Replace Treasury: read current effective grants, grant the new address the required key-scoped writes, revoke the old delegate's intended grants, and re-read confirmed permissions. Check native batching support for atomic replacement; otherwise show each transaction and any incomplete handover. Detect root/admin rights that would keep the old address authorized. Treasury replacement must not silently change payTo.
- [ ] Implement explicit Provider Admin and Service Admin handovers, including incoming-wallet acceptance and verified authority before removing outgoing rights. Cover both name control and the corresponding registry/resolver administration. Name transfer alone does not transfer resolver administration; replacing Provider Admin must not silently replace service Admins. Verify a safe native transaction sequence, with visible recovery for partial completion.
- [ ] Keep grant/revoke actions wallet-signed and enforced by native ENS EAC. The backend prepares/simulates transactions; it does not substitute login state or a custom role table for onchain authorization. Document retained parent, root and upgrade powers.
- [ ] Add unit and native ENS fork/integration coverage for the full hierarchy: initial grants, provider isolation, shared key scope and optional service resolver isolation, unauthorized grants/edits, delegate replacement, lingering broad permissions, Admin handover, revocation and failed/partial setup. Confirm scoped Ops cannot modify payment records or grant roles, and scoped Treasury cannot modify endpoint records. Repeat allowed/denied writes on the public testnet after setup and record receipts.

## 3. Address-level merchant analytics

User-selected first release: aggregate observed supported x402 settlement volume by payment chain, token and payTo address. Exact endpoint-level attribution is optional future work.

- [ ] Index successful supported-token Transfer events to tracked payTo addresses. Classify source: independently verified ENS402 payment, known-facilitator observed transfer, or other/unclassified token receipt. Do not label all USDC deposits x402 revenue.
- [ ] Define a versioned facilitator-address list per chain. For the supported exact/EIP-3009 path inspect AuthorizationUsed and relevant call/receipt evidence where available. AuthorizationUsed alone proves authorization consumption, not an HTTP 402 purchase. Address-origin heuristics can miss other relayers and misclassify unrelated facilitator activity.
- [ ] Group dashboard metrics by chain/token/payTo and declared observation window. Keep amounts as integer atomic units and separate assets. Show volume, payment count and unique payer addresses, not profit or guaranteed global revenue.
- [ ] Recommend a dedicated payTo per service when separate accounting matters. If services share an address, display one shared address total and the sharing services; do not duplicate that amount in store aggregates or claim endpoint separation.
- [ ] Persist historical ENS-to-payTo mappings and registration/owner epochs. PayTo changes or name transfers must not relabel past payments. Default to activity since the service was indexed/listed; make any historical backfill window explicit.
- [ ] Deduplicate by chain/transaction/log identity, handle reorgs/pending states and avoid counting retries. Refunds or failed delivery require separate evidence and must not be inferred from incoming volume.
- [ ] Require verified merchant control for management. A public ENS record can claim any payTo, so listing an address alone does not prove that merchant owns all of its revenue.
- [x] Dynamically discover supported registries/resolvers and reconstruct finalized current catalogs, including pre-link initialization, deletion/expiry, transfers and pointer replacement. This does not implement payment-volume analytics.

Optional later: correlate SDK/merchant request IDs and authorization nonces to confirmed transfers for exact service/order attribution. Not a launch prerequisite for address-level totals.

## 4. Demo catalog preparation

Prepare actual callable test endpoints with clearly labeled fixture outputs, not invented third-party merchant listings. Proposed names/prices below are fixtures, not registered names or final commercial terms.

| Candidate name | Purpose | Example price |
| --- | --- | --- |
| `weather.<provider>.ens402.eth` | City forecast fixture with city/date input | 0.001 USDC |
| `rates.<provider>.ens402.eth` | Currency-rate fixture with base/quote input | 0.002 USDC |
| `research.<provider>.ens402.eth` | Deterministic document/search fixture | 0.01 USDC |
| `buy.ens402.eth` | Existing native subname issuance workflow | 0.01 USDC |

- [x] Implement weather, FX and research fixture endpoints with real Base Sepolia x402 challenges and explicit fixture labels. Current fixtures are fixed GET responses; the existing buy endpoint remains separate.
- [x] Provide unsigned fixture registration/configuration plans and verify native commit/reveal plus indexed fixture reconstruction on Anvil.
- [ ] Publish the fixture services under the configured public provider. Add a second independently controlled provider before claiming multi-store isolation/aggregation rehearsal.
- [ ] Rehearse semantic queries, no results, price filters, endpoint changes, wrong payTo/price, stale index and role revocation. Keep attack fixtures out of normal discovery listings.
- [ ] Acceptance demo: onboarding -> confirmed ENS registration -> dynamically indexed listing -> semantic search -> documented API call -> Guard -> confirmed payment -> address-grouped merchant totals with explicit classification coverage. Retry or shared payTo must not double-count; address rotation preserves historical totals.

## 5. Public testnet demo setup

These require the real owner/configuration/funding. Local fork tests do not complete them.

- [ ] Provision a separate Neon discovery database/role, migrate it, and configure the worker/API with the same live source roots. Keep account and fixture databases separate.
- [ ] Host Envio with HyperSync token or configured RPC, verify its GraphQL journal/checkpoint, and run the finalized export/sync worker. Local Envio dev requires Docker; a bounded RPC ingestion and Hasura checkpoint query passed locally.

- [ ] Owner enables the native child registry beneath `ens402.eth` and verifies its pointer.
- [ ] Configure a dedicated name-issuance worker, grant only `ROLE_REGISTRAR`, and fund Sepolia gas.
- [ ] Publish the paid service's native resolver, metadata, endpoint and fixed-price payment record; configure matching Vercel values.
- [ ] Confirm real Admin/Ops/Treasury grants using `pnpm ens:permissions:check`, then exercise allowed and denied writes.
- [ ] Enable service publication with the correct registrar: permissionless ServiceRegistrar for public direct registrations, SharedProviderServiceRegistrar for the default shared company resolver, or restricted ProviderServiceRegistrar for isolated services. Configure the UI for the selected provider and verify grants.
- [ ] Complete Privy browser login, approve scope and fund the displayed payer with Base Sepolia USDC.
- [ ] Run a public purchase; verify both payment receipt and recipient name ownership, then rehearse recovery and presentation.

## 6. Contract quality and maintainability

- [x] Define `IServiceRegistrar` with shared structs, events, errors, getters and documented API; implementation conforms. External ABI compatibility and commitment-boundary tests pass.
- [ ] Review contract, interface, library, function, variable, event and error names for consistent Solidity conventions and clear domain meaning. Distinguish namespace owner, service Admin, Ops, Treasury delegate and payment recipient; document atomic price units and expiry timestamps.
- [ ] Add complete NatSpec to public interfaces and implementation-specific behavior: `@notice`, `@dev`, `@param`, `@return` and `@inheritdoc` where applicable. Document commit/reveal timing, permission scopes, initialization and revocation, revert conditions, trust boundaries and name-transfer versus resolver-administration behavior.
- [ ] Review source organization, visibility, mutability, custom errors, emitted lifecycle events and external-call/reentrancy handling. Preserve native ENS EAC enforcement; avoid introducing duplicate custom role management or unnecessary upgradeability.
- [ ] Make setup scripts readable and reproducible: explicit chain/deployment checks, named transaction steps, required signer/role, post-transaction verification and clear distinction between unsigned plans and broadcasting. Keep keys out of generated artifacts.
- [ ] Validate the refactor with formatting/build checks, relevant unit and native ENS fork/integration tests, and ABI/SDK compatibility checks. Cover unauthorized calls, role isolation/revocation, commitment boundaries and atomic rollback; record actual results in AUDIT.md.

### Resolver scope and ancestor authority acceptance

- [x] Verify native key grants cover every name on an instance, separate resolvers isolate writers, fallback is per name, linked names can share one record bundle, and retained admin permits action regrant. Five pinned-fork tests pass.
- [ ] Verify public shared-provider bindings and real Safe execution. Shared mode pins provider name, registry and resolver; per-name records must exist. A one-record count does not prove a single-name resolver. Audit link/upgrade rights and aliases before claiming exclusive use.
- [ ] Audit ancestor pointer, expiry/re-registration and root/admin/upgrade routes before claiming platform-independent control. Prefer minimal initialization grants. Prepare irreversible renunciation only after recovery/renewal/handover tests; never infer emancipation from text-role removal alone.

## 7. Deferred or separately scoped

- [ ] Arbitrary `.eth` purchase merchant: official registrar rent/duration, funding, commit/reveal and recovery. Current merchant only issues subnames.
- [ ] Multi-namespace lifecycle support beyond the initial supported roots. Provider-to-service registry onboarding is core scope above.
- [ ] Service version aliases and dynamic pricing.
- [ ] World, ERC-8004 and session-key integrations, if selected later.

No mainnet transactions. No completed feature is implied by this list.

## Research references

Checked September 26, 2026. These establish existing ecosystem capabilities, not feature parity or completeness.

- [Bazaar](https://docs.cdp.coinbase.com/x402/bazaar): text/semantic search, filters and merchant-address listings.
- [x402scan](https://github.com/Merit-Systems/x402scan): ecosystem explorer, transaction volumes and resource registration.
- [x402scan discovery](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md): OpenAPI-first call metadata and well-known discovery documents.
- [Envio dynamic contracts](https://docs.envio.dev/docs/HyperIndex/dynamic-contracts): supports dynamic contract registration; dynamic ingestion and bounded lifecycle reconstruction are implemented; hosted ingestion remains unverified.

Address-level research: the x402scan Base CDP/Bitquery query implementations filter token Transfer events by known facilitator transaction sender. This is a provider-coverage heuristic, not a universal x402 event. Our current settlement verifier already checks Transfer and AuthorizationUsed against a known payment authorization.

## Recipient model decision

- [ ] Proposed simplification: derive the x402 recipient from the current service-name holder and remove payTo from ens402.payment. This is not implemented; current code still uses explicit payment-record payTo. Keep name ownership distinct from an ENS address record. User prefers the holder-derived recipient model; destination-chain smart-wallet support must be handled explicitly. Cover ownership transfer, expiry, fresh reads and approval invalidation. ENS ownership is on Sepolia while USDC settlement is on Base Sepolia; same-address smart accounts need independently verified destination-chain control. Define the supported wallet types and transfer authority before migration. Treasury payment-key writes alone would no longer rotate the recipient.
