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

## 2. Public testnet demo setup

These require the real owner/configuration/funding. Local fork tests do not complete them.

- [ ] Owner enables the native child registry beneath `ens402.eth` and verifies its pointer.
- [ ] Configure a dedicated name-issuance worker, grant only `ROLE_REGISTRAR`, and fund Sepolia gas.
- [ ] Publish the paid service's native resolver, metadata, endpoint and fixed-price payment record; configure matching Vercel values.
- [ ] Confirm real Admin/Ops/Treasury grants using `pnpm ens:permissions:check`, then exercise allowed and denied writes.
- [ ] If enabling full-service `/register`, separately deploy/configure optional ServiceRegistrar and its registrar grant.
- [ ] Complete Privy browser login, approve scope and fund the displayed payer with Base Sepolia USDC.
- [ ] Run a public purchase; verify both payment receipt and recipient name ownership, then rehearse recovery and presentation.

## 3. Deferred or separately scoped

- [ ] Arbitrary `.eth` purchase merchant: official registrar rent/duration, funding, commit/reveal and recovery. Current merchant only issues subnames.
- [ ] Provider-to-service registry onboarding and multi-namespace lifecycle support beyond the initial supported roots.
- [ ] Service version aliases and dynamic pricing.
- [ ] World, ERC-8004 and session-key integrations, if selected later.

No mainnet transactions. No completed feature is implied by this list.
