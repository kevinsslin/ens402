# ENS402: start here

**Discover. Govern. Guard.** ENS402 puts x402 service configuration on ENS, governs updates with native EAC, and verifies payment requests before agents sign.

This is the single current scope and status overview. Updated September 27, 2026 against the current implementation. A feature being implemented or tested on Anvil does not mean it is configured on the public testnet.

## Demo experience

**Search services** opens a prompt-first keyword/semantic search, with results directly below the input. Search is public; selecting a service prompts login before current ENS inspection and checkout. **Onboard your service** opens provider setup. The footer repeats these destinations and links to docs and architecture.

The human demo confirms the current fixed price and payment wallet. It does not expose recurring authorization management, daily-budget fields, agent-key creation or World ID. The existing payment backend still binds checkout to the inspected endpoint, recipient and price, with a short-lived internal payment context; Guard checks and wallet signing remain required. The SDK's existing advanced integrations remain separate from this UI.

## What works, and what does not yet

| Area | Status | What that means |
| --- | --- | --- |
| ENS service records | Implemented and fork-tested | Resolve a known name; read description, optional picture, endpoint, explicit call metadata, status and fixed-price payment terms |
| Native EAC | Implemented and fork-tested | Scoped Ops/Treasury writes, Admin grants, rejected unauthorized edits, revocation and root-override detection |
| Guard SDK | Implemented and tested | Compare actual HTTP 402 with fresh ENS, check consent and risk, sign and verify settlement |
| Privy and self signing | Implemented | Hosted approvals, agent keys, dedicated managed wallets and independent EOA signing; live Privy signature/policy tests passed |
| Intercepta | Implemented; live clean scan/cache tested | Ethereum-mainnet address evidence; risky/failure cases use test fixtures, not verified API-quality ratings |
| Console and provider forms | Implemented | Landing, architecture, service inspection, approvals, native edits, receipts and editable example form |
| PostgreSQL | Implemented and locally tested | Separate account ledger and search database; durable catalog, keyword index, embeddings, retries and query budget |
| Paid subname endpoint | Implemented; dual-Anvil tested | Register `<label>.ens402.eth` directly to a recipient; public namespace and worker setup still required |
| Public funded purchase | Pending setup and verification | Parent registry, service resolver, actual grants, worker gas, buyer funding and human login remain |
| Envio indexer | Implemented; public hosting pending | Dynamic native event journal, finalized catalog reconstruction, recurring sync and independent Anvil reconstruction tested |
| Keyword and semantic search | Implemented; local live embeddings verified | PostgreSQL full-text search and hybrid ranking; OpenAI generated three persisted fixture vectors. Public indexed catalog remains pending |
| SDK `discover()` | Implemented; catalog setup pending | Configurable candidate search API client; public API returns 503 until an operator catalog is configured |
| MCP | Implemented and route-tested | Read-only discovery and resolution at `/api/mcp`; no signing or approval tools |
| Curvegrid MultiBaas | Root contracts linked on Sepolia; event ingestion pending live activity | Read-only indexed Registry/Resolver history through API and MCP; initial free-plan backfill spans only 100 blocks and does not index every provider resolver |
| Agent Skill | Implemented | Discovery, source validation, fresh resolution and approved payment instructions in `integrations/agent-skill/SKILL.md` |
| Merchant onboarding and service dashboard | Implemented; public wallet rehearsal pending | Resumable provider setup, single-transaction shared-provider publication (older registrars retain commit/reveal), listing states and live native permission checks |
| Address-level merchant analytics | Implemented; hosted scanner setup pending | Finalized USDC receipts, separate evidence classifications, shared-address totals, historical control epochs and reorg replay |
| Provider registry tree | Implemented; public setup pending | Native provider setup, shared resolver, delegate replacement and accepted Admin handovers |
| Buy an arbitrary `.eth` | Not implemented | Requires official ETHRegistrar availability, rent, funding and commit/reveal integration |
| Call metadata | Implemented | `ens402.call` publishes method, schemas and examples; new publication verifies backend metadata before registration and Guard pins it before signing; version aliases remain deferred |
| World, ERC-8004, session keys | Deferred | Not mandatory runtime dependencies |

## The three layers

- **Discover / ENS:** publish and read what a service does, where it runs and how it gets paid. Known-name resolution, root-scoped catalog reconstruction and search exist; public catalog setup remains pending.
- **Govern / native EAC:** ENS contracts check permission when a wallet changes a record. Chain transactions and events make changes traceable. This does not validate an HTTP bill.
- **Guard / SDK:** before requesting a signature, compare HTTP 402 with current ENS terms and buyer approval, then apply screening. Unrestricted keys can bypass this flow.

Why these layers belong together: service descriptions and call metadata provide public context that independent indexers can reconstruct; native EAC separates operational edits from financial governance; the SDK compares the API request with that independent source before asking a wallet to sign. A stable name lets endpoints move without becoming the authority for their own payment configuration. Public metadata proves publication and change history, not service quality.

Current cross-chain boundary: the application reads ENS through Sepolia RPC and verifies settlement through Base Sepolia RPC. There is no bridge or destination-chain contract enforcing Sepolia records. An EAC grant on Sepolia does not prove control of a same-address Safe on Base Sepolia. New registrations use schema v3: derive the recipient from the current service name owner, without a stored payTo. Contract holders need a deployed destination wallet and a signature verified on Base Sepolia; EOAs receive a cross-chain code eligibility check. Legacy v1/v2 explicit recipients remain readable.

These are functional layers. The core namespace architecture is **Platform Registry -> Provider Registry -> Service**, with **one shared native PermissionedResolver per provider** as the selected default. Each service has a separate record bundle and name-owner recipient; Ops and Treasury Admin key grants span all bundles. Separate resolver instances remain an option for teams with different trusted writers. Platform and Provider registries are native ENS UserRegistry instances, not custom RBAC replacements. Provider onboarding is required scope; support for additional provider-owned roots remains a later extension.

Provider Admin manages the registry and shared resolver governance. Ops edits endpoint/description/avatar/call metadata; Treasury Admin holds the payment-key writer role, not ROLE_SET_TEXT_ADMIN, and can use an EOA, MPC or multisig wallet. Registering wallets receive service-name control, not shared resolver administration. Roles are scoped to specific contracts/resources and do not automatically inherit down the tree. Existing ServiceRegistrar registration initializes service roles atomically, and the restricted variants check live native registration authority. SharedProviderServiceRegistrar initializes separate bundles in the existing provider resolver without granting publishers root text authority. Resumable provider setup, role replacement and Admin handover are Anvil-tested. Wallet-driven onboarding and management pages are implemented; public wallet rehearsal still requires real setup. The website must show the complete target tree and label implementation status separately.

## Agreed discovery direction

Envio indexes supported public ENS registries and their lifecycle. Our Search API serves candidates from that indexed data. SDK and MCP share that API, with a configurable base URL so another operator can provide it.

```text
ENS public records/events
  -> Envio indexing and current-state synchronization
  -> searchable service records + description embeddings
  -> Search API
  -> SDK discover() / MCP / Console
  -> choose a candidate -> fresh ENS read -> Guard -> signer
```

**User-confirmed search asset default:** Base Sepolia USDC, network `eip155:84532`, contract `0x036cbd53842c5426634e7929541ec2318f3dcf7e`, 6 decimals. This is the search interface default; the current payment implementation only supports this asset.

Implemented Search API fields (persistent catalog or explicit snapshot source):

| Field | Meaning |
| --- | --- |
| `query` | Natural-language service request |
| `paymentNetwork` | Payment chain, distinct from the ENS indexing chain |
| `assetAddress` | Token contract on that payment chain; defaults to the supported USDC |
| `maxPricePerRequestAtomic` | Optional per-request ceiling in atomic units; omitted means no price filter, zero means free only |
| `pageSize` | Result count, suggested default 10; never a payment budget |

Keyword and semantic search are required. Exact-name matches should remain strong; typo similarity can be a fallback. Semantic relevance means suitability for the query, not safety, reliability or reputation. Monetary filters compare the same chain/token and integer units. `0.01 USDC = 10000` atomic units. A search filter never grants payment authority.

Hosted semantic search uses embeddings to retrieve candidates, then an OpenAI relevance check to reject candidates that cannot answer the requested task. Positive cosine similarity alone is insufficient. Semantic-only candidates below 0.2 are excluded; up to 20 remaining candidates are checked. If the check fails or the shared AI request budget is exhausted, only keyword/name matches remain. Empty queries still browse the catalog. The relevance check uses the existing OpenAI embedding key and `DISCOVERY_RELEVANCE_MODEL` (default `gpt-4.1-mini`), with a five-minute per-instance cache tied to query and candidate metadata.

### Storage and embeddings

- Account/payment data and discovery data use separate PostgreSQL databases. `DATABASE_URL` remains the account ledger; `DISCOVERY_DATABASE_URL` holds public service snapshots, keyword indexes, embeddings and query budgets. Provision a separate Neon database and role for hosted discovery.
- The local discovery database currently contains an explicitly labeled fixture source. Do not reuse that source-bound database for the live chain catalog. Use a new empty discovery database for each independent source/root configuration.
- OpenAI `text-embedding-3-small` is configured locally and has produced three persisted fixture vectors. A live query, "Convert dollars into euros", returned the currency fixture through a semantic-only match. Hosted credentials and deployment remain pending. Metadata hashes, model versions, leases and retries control embedding refresh. Current bounded ranking uses PostgreSQL arrays, not a pgvector/ANN deployment.
- Envio journals native events. The snapshot exporter reads complete candidates from that journal or RPC logs, then re-reads canonical ENS state at one finalized block. A serial worker synchronizes complete snapshots atomically; deleted/expired services disappear and failed refreshes preserve the previous catalog.
- Search remains an offchain view. Anyone can reconstruct supported roots from the declared start block; ranking and models may differ. Search results carry source/checkpoint evidence and require fresh ENS resolution before payment.

## Buyer and merchant product flow

Target buyer flow: search a need, inspect ranked candidates with ENS identity and call instructions, choose a service, then approve and purchase through Guard. Rankings express relevance, not guaranteed quality. `/discover`, SDK search, MCP and onchain call-schema publication are implemented. Selecting a result opens Console for fresh inspection; the public indexed catalog and funded purchase rehearsal still require setup.

Merchant flow: `/provider` prepares wallet-signed native setup and service publication, then `/merchant` reads actual control, listing status and address-level receipts. Registration confirmation is distinct from catalog ingestion. All management writes require native wallet signatures.

Envio can dynamically add supported registries/resolvers discovered from configured roots. It cannot observe arbitrary HTTP requests or infer the purchased endpoint from a token transfer. First-release analytics aggregate observed supported settlements by chain/token/payTo with explicit facilitator/verification coverage. Dedicated service addresses enable simpler separate accounting; shared addresses show shared totals and must not be double-counted. Transfer plus AuthorizationUsed is not uniquely x402, and a known facilitator transaction sender is a classification heuristic. Preserve historical address mappings and never treat all USDC deposits as x402 revenue. Exact endpoint attribution through request-to-settlement correlation is deferred.

Prepare several named, callable test services with explicit fixture labels and published input/output examples before presenting. See TODO.md for the catalog, complete journey and acceptance cases. No public names have been registered by this implementation.

## Remaining work

Use [TODO.md](TODO.md) for the single actionable backlog, including discovery implementation, public demo setup and deferred features.

## Verified evidence

Earlier payment baseline validation passed **98 unit tests, 28 PostgreSQL integration tests and 32 Solidity fork tests**, the dual-Anvil flow, typecheck and production build. Subsequent discovery/provider evidence is recorded separately in AUDIT.md. Actual USDC contract decimals were read as 6. Live Intercepta clean scan/cache and live Privy signing/policy-denial checks passed. Browser checks covered public forms and diagrams, including 390px layout.

Public funded end-to-end purchase and deployed service roles remain unverified. Latest recorded parent read: Sepolia block 11786000, `ens402.eth` owned but child registry unset. See AUDIT.md for evidence scope; this table does not imply a fresh chain read on every documentation edit.

Latest discovery evidence: native Anvil registration and deterministic reconstruction, isolated PostgreSQL keyword search and expiry removal, generated Envio handler tests, three live OpenAI fixture embeddings and a semantic-only currency query. These do not prove hosted Envio ingestion or public service deployment.

## Document guide

| Need | Document |
| --- | --- |
| What exists, what is missing, next priorities | **This README** |
| Environment, native roles, owner actions, funding and demo steps | [SETUP.md](SETUP.md) |
| Test evidence, audit findings and recovery limitations | [AUDIT.md](AUDIT.md) |
| Remaining work and setup checklist | [TODO.md](TODO.md) |


The filled-in form is at `/register/example`; the SDK integration guide is at `/docs`. Source lives in `apps/web`, `packages/sdk`, `packages/server` and `contracts`. SDK packages are workspace packages, not npm releases.

Obsolete proposals and duplicate status files were removed. Provider source snapshots and raw evidence remain in Git-ignored `docs/reference/` and `docs/validation/`; they are reference material, not additional current scope documents.

## Discovery comparison

The landing page compares publication and governance guarantees. Decentralization refers to the configuration source, not every component or overall product quality.

| Dimension | ENS402 | Bazaar (CDP hosted catalog) | x402scan |
| --- | --- | --- | --- |
| Directory source | Public ENS records; decentralized source | Centralized facilitator catalog of API metadata | Centralized operator index of API metadata |
| Configuration independent of the API | Separate ENS source for payment comparison | Not specified by the discovery specification | Not specified by the discovery specification |
| Separate Ops/Treasury permissions enforced onchain | Native key-scoped writer roles | Not specified by the discovery specification | Not specified by the discovery specification |
| Public, verifiable configuration edit history | Chain transactions and events | Not specified by the discovery specification | Not specified by the discovery specification |

ENS402 hosted search is operator-run; namespace admission and Admin powers remain. Public testnet setup is pending. Bazaar's open extension does not prescribe storage or governance, and x402scan is open source. Independent implementations can add controls; “not specified” does not mean impossible. This table describes configuration edit history, not payment history, which other explorers also index.

Sources checked September 27, 2026: [Bazaar specification](https://github.com/coinbase/x402/blob/main/specs/extensions/bazaar.md), [x402scan discovery specification](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md), and [x402scan README](https://github.com/Merit-Systems/x402scan). Bazaar is an open extension with facilitator-side cataloging. x402scan is open source, supports OpenAPI/well-known discovery and URL submission, and its discovery spec treats runtime 402 as authoritative over static metadata. Neither should be described as manual-only or impossible to self-host. Absence from these specifications is not evidence that third-party integrations cannot add the feature.
