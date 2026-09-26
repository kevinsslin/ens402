# ENS402: start here

**Discover. Govern. Guard.** ENS402 puts x402 service configuration on ENS, governs updates with native EAC, and verifies payment requests before agents sign.

This is the single current scope and status overview. Updated September 26, 2026 against implementation `d0bc5c4`. A feature being implemented or tested on Anvil does not mean it is configured on the public testnet.

## What works, and what does not yet

| Area | Status | What that means |
| --- | --- | --- |
| ENS service records | Implemented and fork-tested | Resolve a known name; read description, optional picture, endpoint, status and fixed-price payment terms |
| Native EAC | Implemented and fork-tested | Scoped Ops/Treasury writes, Admin grants, rejected unauthorized edits, revocation and root-override detection |
| Guard SDK | Implemented and tested | Compare actual HTTP 402 with fresh ENS, check consent and risk, sign and verify settlement |
| Privy and self signing | Implemented | Hosted approvals, agent keys, dedicated managed wallets and independent EOA signing; live Privy signature/policy tests passed |
| Intercepta | Implemented; live clean scan/cache tested | Ethereum-mainnet address evidence; risky/failure cases use test fixtures, not verified API-quality ratings |
| Console and provider forms | Implemented | Landing, architecture, service inspection, approvals, native edits, receipts and editable example form |
| Neon | Connected and migration tested | Existing accounts, approvals, budgets and payment/order ledger; no search or vector tables yet |
| Paid subname endpoint | Implemented; dual-Anvil tested | Register `<label>.ens402.eth` directly to a recipient; public namespace and worker setup still required |
| Public funded purchase | Pending setup and verification | Parent registry, service resolver, actual grants, worker gas, buyer funding and human login remain |
| Envio indexer | Not implemented | No chain-event ingestion, catalog reconstruction or indexer deployment yet |
| Keyword and semantic search | Required next; not implemented | No search index, embeddings, query ranking or Search API yet |
| SDK `discover()` | Not implemented | Existing SDK resolves known names; it does not search for unknown services |
| MCP | Not implemented | Intended thin interface over the same discovery/resolve capabilities |
| Agent Skill | Payment instructions exist | `integrations/agent-skill/SKILL.md`; discovery instructions/tools are not implemented |
| Provider registry tree | Planned | Direct subnames are implemented; platform/provider/service onboarding is not |
| Buy an arbitrary `.eth` | Not implemented | Requires official ETHRegistrar availability, rent, funding and commit/reveal integration |
| Rich call schema, version aliases | Planned | Description alone does not tell an agent every input needed to call an API |
| World, ERC-8004, session keys | Deferred | Not mandatory runtime dependencies |

## The three layers

- **Discover / ENS:** publish and read what a service does, where it runs and how it gets paid. Known-name resolution exists; searchable discovery is the next implementation.
- **Govern / native EAC:** ENS contracts check permission when a wallet changes a record. Chain transactions and events make changes traceable. This does not validate an HTTP bill.
- **Guard / SDK:** before requesting a signature, compare HTTP 402 with current ENS terms and buyer approval, then apply screening. Unrestricted keys can bypass this flow.

These are functional layers, not three levels of domain names. The optional platform/provider/service tree is a separate future organization model. Services need not use our parent namespace.

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

**User-confirmed search asset default:** Base Sepolia USDC, network `eip155:84532`, contract `0x036cbd53842c5426634e7929541ec2318f3dcf7e`, 6 decimals. This is a default for the future search interface; the current payment implementation only supports this asset.

Proposed API fields, not an implemented endpoint:

| Field | Meaning |
| --- | --- |
| `query` | Natural-language service request |
| `paymentNetwork` | Payment chain, distinct from the ENS indexing chain |
| `assetAddress` | Token contract on that payment chain; defaults to the supported USDC |
| `maxPricePerRequestAtomic` | Optional per-request ceiling in atomic units; omitted means no price filter, zero means free only |
| `pageSize` | Result count, suggested default 10; never a payment budget |

Keyword and semantic search are required. Exact-name matches should remain strong; typo similarity can be a fallback. Semantic relevance means suitability for the query, not safety, reliability or reputation. Monetary filters compare the same chain/token and integer units. `0.01 USDC = 10000` atomic units. A search filter never grants payment authority.

### Storage and embeddings: proposed, not provisioned

- Existing Neon PostgreSQL holds application data. Envio has its own indexing/storage deployment requirements, still to be validated.
- Prefer a separate search schema in the existing Neon database, with PostgreSQL full-text search and `pgvector` if supported by the selected deployment. A dedicated vector database is not inherently necessary. Do not give a public indexer access to buyer/payment tables.
- Embeddings are vectors computed from public service metadata by a selected model. Recompute when the indexed content changes; store the content hash, model/version and source block. Compute a query vector at search time. Price and roles are structured data, not facts inferred from embeddings.
- Model/provider, dimensions, Envio-to-search synchronization, retry/backfill/reorg handling and database permissions remain implementation decisions. No embedding provider credentials or vector migration are configured by this proposal.
- Search is an offchain view. Other operators can reproduce the supported raw catalog once the indexer is built; their model and ranking may differ. Re-resolve ENS before payment. Do not claim globally complete search, fair ranking or automatic quality verification.

## Next work, in order

1. Implement Envio ingestion and deterministic catalog reconstruction for explicitly supported roots, including changes, expiry and reorg handling.
2. Add search records, keyword indexes, an embedding job and semantic retrieval. Verify updates/deletions invalidate stale results.
3. Expose Search API, SDK `discover()` and the Console search flow. Demonstrate fresh ENS verification after candidate selection.
4. Add MCP tools and update the existing agent Skill to use discovery. Define minimum call metadata for autonomous API use.
5. Complete public namespace/service setup and the funded two-chain demo. Detailed actions are in SETUP.md.

Buying an independent `.eth` remains a separate merchant adapter, not a requirement for discovery.

## Verified evidence

Latest implementation validation: **98 unit tests, 28 PostgreSQL integration tests, 32 Solidity fork tests**, complete dual-Anvil flow, typecheck and production build passed. Actual USDC contract decimals were read as 6. Live Intercepta clean scan/cache and live Privy signing/policy-denial checks passed. Browser checks covered public forms and diagrams, including 390px layout.

Public funded end-to-end purchase and deployed service roles remain unverified. Latest recorded parent read: Sepolia block 11786000, `ens402.eth` owned but child registry unset. See AUDIT.md for evidence scope; this table does not imply a fresh chain read on every documentation edit.

## Only open another document for a specific task

| Need | Document |
| --- | --- |
| What exists, what is missing, next priorities | **This README** |
| Environment values, owner actions, funding and setup commands | [SETUP.md](SETUP.md) |
| Exact native roles, custom contracts and deployment boundaries | [CONTRACTS.md](CONTRACTS.md) |
| Test evidence, audit findings and recovery limitations | [AUDIT.md](AUDIT.md) |
| Presentation sequence | [DEMO.md](DEMO.md) |

The filled-in form is at `/register/example`; the SDK integration guide is at `/docs`. Source lives in `apps/web`, `packages/sdk`, `packages/server` and `contracts`. SDK packages are workspace packages, not npm releases.

Old discussion/proposal/status snapshots are archived under Git-ignored `docs/archive/`; provider sources and raw receipts remain under `docs/reference/` and `docs/validation/`. They do not override this current overview.
