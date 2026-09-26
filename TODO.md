# ENS402 remaining work

Single actionable backlog. Current implementation and evidence: [README.md](README.md) and [AUDIT.md](AUDIT.md). Exact operator inputs: [SETUP.md](SETUP.md). An unchecked item is not complete.

## 1. Discovery implementation

- [ ] Build Envio ingestion for explicitly supported ENS roots, registry/resolver changes, expiry and reorg handling.
- [ ] Demonstrate independent reconstruction of the same raw catalog at the same block.
- [ ] Add search records and keyword indexes. Default payment asset: Base Sepolia USDC (`eip155:84532`, `0x036cbd53842c5426634e7929541ec2318f3dcf7e`, 6 decimals).
- [ ] Select embedding model/provider; validate Neon pgvector support and Envio-to-search synchronization. Keep search access separate from private account/payment tables.
- [ ] Implement semantic search and metadata-change embedding updates, including retry, deletion and stale-result handling. Exact-name/keyword matches remain supported.
- [ ] Implement Search API with query, payment network, asset address, optional atomic per-request price ceiling and result count. Ranking is relevance, not proof of quality.
- [ ] Add SDK `discover()` with configurable API URL and Console search. Re-resolve ENS before payment.
- [ ] Add minimum method/input schema metadata for agents to call discovered services reliably.
- [ ] Add MCP tools and discovery instructions to the existing payment Skill.

## 2. Buyer and merchant journeys

- [ ] Buyer search results show ENS name, description, matching reason, atomic/human price, payment asset/network, indexed block/time and clear fixture/live status. Keep relevance separate from trust and quality.
- [ ] Service detail shows HTTP method, input schema/example, output example and SDK/curl usage. Treat provider content as untrusted data; no inferred call format from prose alone.
- [ ] Buyer can inspect a candidate, supply inputs, approve scope and purchase through the existing Guard. Search results never constitute payment authorization.
- [ ] Provider onboarding collects description, optional image, endpoint, fixed price, payout and Ops/Treasury delegates, then checks endpoint/call metadata before commit/reveal.
- [ ] After confirmed service registration, return to a merchant dashboard with states: draft, awaiting signature, registering, awaiting index, listed, suspended/expired or index error. Receipt confirmation alone does not mean searchable.
- [ ] Merchant dashboard lists controlled services with their current ENS records and actual edit permissions. Authenticate wallet control and check current onchain roles; a Privy login or payout address alone is not merchant administration.
- [ ] Keep store-to-service membership explicit and verifiable. For the first release, group names by their verified controlling account; do not infer company ownership or revenue attribution merely from a shared payTo. Provider registry hierarchy remains separate future work.

## 3. Address-level merchant analytics

User-selected first release: aggregate observed supported x402 settlement volume by payment chain, token and payTo address. Exact endpoint-level attribution is optional future work.

- [ ] Index successful supported-token Transfer events to tracked payTo addresses. Classify source: independently verified ENS402 payment, known-facilitator observed transfer, or other/unclassified token receipt. Do not label all USDC deposits x402 revenue.
- [ ] Define a versioned facilitator-address list per chain. For the supported exact/EIP-3009 path inspect AuthorizationUsed and relevant call/receipt evidence where available. AuthorizationUsed alone proves authorization consumption, not an HTTP 402 purchase. Address-origin heuristics can miss other relayers and misclassify unrelated facilitator activity.
- [ ] Group dashboard metrics by chain/token/payTo and declared observation window. Keep amounts as integer atomic units and separate assets. Show volume, payment count and unique payer addresses, not profit or guaranteed global revenue.
- [ ] Recommend a dedicated payTo per service when separate accounting matters. If services share an address, display one shared address total and the sharing services; do not duplicate that amount in store aggregates or claim endpoint separation.
- [ ] Persist historical ENS-to-payTo mappings and registration/owner epochs. PayTo changes or name transfers must not relabel past payments. Default to activity since the service was indexed/listed; make any historical backfill window explicit.
- [ ] Deduplicate by chain/transaction/log identity, handle reorgs/pending states and avoid counting retries. Refunds or failed delivery require separate evidence and must not be inferred from incoming volume.
- [ ] Require verified merchant control for management. A public ENS record can claim any payTo, so listing an address alone does not prove that merchant owns all of its revenue.
- [ ] Dynamically discover supported registries/resolvers from configured roots; backfill deployment-block events, including same-transaction record initialization. Handle deletion/expiry, transfers and resolver replacement.

Optional later: correlate SDK/merchant request IDs and authorization nonces to confirmed transfers for exact service/order attribution. Not a launch prerequisite for address-level totals.

## 4. Demo catalog preparation

Prepare actual callable test endpoints with clearly labeled fixture outputs, not invented third-party merchant listings. Proposed names/prices below are fixtures, not registered names or final commercial terms.

| Candidate name | Purpose | Example price |
| --- | --- | --- |
| `weather.ens402.eth` | City forecast fixture with city/date input | 0.001 USDC |
| `fx.ens402.eth` | Currency-rate fixture with base/quote input | 0.002 USDC |
| `research.ens402.eth` | Deterministic document/search fixture | 0.01 USDC |
| `buy.ens402.eth` | Existing native subname issuance workflow | 0.01 USDC |

- [ ] Implement the three fixture data endpoints with schemas, examples and real testnet x402 challenges. Clearly separate fixture data from real settlement and name issuance.
- [ ] Provide a repeatable local seed and unsigned public registration/configuration plans for all services. Use at least two independently controlled demo merchant accounts to test isolation and per-store aggregation.
- [ ] Rehearse semantic queries, no results, price filters, endpoint changes, wrong payTo/price, stale index and role revocation. Keep attack fixtures out of normal discovery listings.
- [ ] Acceptance demo: onboarding -> confirmed ENS registration -> dynamically indexed listing -> semantic search -> documented API call -> Guard -> confirmed payment -> address-grouped merchant totals with explicit classification coverage. Retry or shared payTo must not double-count; address rotation preserves historical totals.

## 5. Public testnet demo setup

These require the real owner/configuration/funding. Local fork tests do not complete them.

- [ ] Owner enables the native child registry beneath `ens402.eth` and verifies its pointer.
- [ ] Configure a dedicated name-issuance worker, grant only `ROLE_REGISTRAR`, and fund Sepolia gas.
- [ ] Publish the paid service's native resolver, metadata, endpoint and fixed-price payment record; configure matching Vercel values.
- [ ] Confirm real Admin/Ops/Treasury grants using `pnpm ens:permissions:check`, then exercise allowed and denied writes.
- [ ] If enabling full-service `/register`, separately deploy/configure optional ServiceRegistrar and its registrar grant.
- [ ] Complete Privy browser login, approve scope and fund the displayed payer with Base Sepolia USDC.
- [ ] Run a public purchase; verify both payment receipt and recipient name ownership, then rehearse recovery and presentation.

## 6. Deferred or separately scoped

- [ ] Arbitrary `.eth` purchase merchant: official registrar rent/duration, funding, commit/reveal and recovery. Current merchant only issues subnames.
- [ ] Provider-to-service registry onboarding and multi-namespace lifecycle support beyond the initial supported roots.
- [ ] Service version aliases and dynamic pricing.
- [ ] World, ERC-8004 and session-key integrations, if selected later.

No mainnet transactions. No completed feature is implied by this list.

## Research references

Checked September 26, 2026. These establish existing ecosystem capabilities, not feature parity or completeness.

- [Bazaar](https://docs.cdp.coinbase.com/x402/bazaar): text/semantic search, filters and merchant-address listings.
- [x402scan](https://github.com/Merit-Systems/x402scan): ecosystem explorer, transaction volumes and resource registration.
- [x402scan discovery](https://github.com/Merit-Systems/x402scan/blob/main/docs/DISCOVERY.md): OpenAPI-first call metadata and well-known discovery documents.
- [Envio dynamic contracts](https://docs.envio.dev/docs/HyperIndex/dynamic-contracts): supports dynamic contract registration; ENS lifecycle/backfill rules still need our implementation.

Address-level research: the x402scan Base CDP/Bitquery query implementations filter token Transfer events by known facilitator transaction sender. This is a provider-coverage heuristic, not a universal x402 event. Our current settlement verifier already checks Transfer and AuthorizationUsed against a known payment authorization.
