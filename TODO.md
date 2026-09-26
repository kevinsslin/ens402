# ENS402 remaining work

Current scope: **Discover, Govern, Guard**. Namespace: **Platform Registry -> Provider Registry -> Service**, with one shared native resolver per provider. Start with [README.md](README.md); operator steps are in [SETUP.md](SETUP.md), test evidence in [AUDIT.md](AUDIT.md).

## Implemented and locally verified

- [x] Envio native event ingestion, dynamic registry/resolver discovery, finalized reconstruction, pre-link records, expiry and canonical replay. Independent Anvil reconstruction produces the same catalog.
- [x] Separate persistent discovery PostgreSQL, keyword and semantic search, embedding refresh/retries/model rotation, query budget and stale-result checks. Local OpenAI embeddings and semantic-only queries passed.
- [x] Search API, configurable SDK `discover()`, read-only MCP and agent Skill. Results include ENS identity, call schema/examples, exact prices and source evidence.
- [x] Callable weather/rates/research fixtures and unsigned registration plans. Native commit/reveal and indexed reconstruction tested; public publication remains below.
- [x] Resumable provider setup scripts and restricted/shared service registrars. Native factory/implementation checks, hierarchy binding, distinct record bundles and live publisher/delegate checks.
- [x] Wallet-driven `/provider` onboarding, service publication and return to `/merchant`. Current role/control observations and `awaiting-index` versus `listed` states; publicly funded browser rehearsal remains below.
- [x] Atomic Ops/Treasury replacement with native multicall, broad-rights rejection and permission postchecks. Shared-key grants cover all bundles, and Treasury replacement does not rotate recipients.
- [x] Incoming-accepted Admin handover planner, staged incoming grants/name transfer/outgoing revocation, and recovery after each receipt. Native Anvil exercise completed. Acceptance is a planner condition, not an ENS contract modification.
- [x] Fixed-price schema v3 derives payTo from current service-name ownership. Legacy v1/v2 remain readable. Ownership changes invalidate prior approval; fresh destination-wallet evidence is required before signing.
- [x] Address-level USDC analytics: finalized receipts, shared-address deduplication, integer totals, unique payers, observation windows, historical control/address epochs and reorg replay.
- [x] Separate unclassified/facilitator/verified categories. Trusted terminal local payment evidence is independently verified against canonical settlement receipts; no public proof submission.
- [x] Contract interface and NatSpec, native deployment/role libraries, explicit atomic units/expiry, commitment binding, reentrancy protection and atomic rollback coverage. No duplicate custom RBAC or new upgrade system.

## Public launch: operator inputs and signatures required

Local tests do not complete these steps. No mainnet transactions.

1. [ ] **Platform owner:** enable the native child registry under `ens402.eth`, sign the reviewed setup plan, and verify pointers/roles. Existing root owner: `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`.
2. [ ] **Treasury:** supply the real Sepolia Safe, verify owners/threshold and rehearse its signing. Local contract fixtures are not a Safe audit. For a contract service-name holder, deploy/control its Base Sepolia wallet and publish the destination signature proof.
3. [ ] **Provider:** complete `/provider` using the real Admin/Platform/Ops/Treasury signers. Publish fixture services and a second independent provider; verify allowed/denied writes publicly with receipts. Add confirmed provider bindings to hosted Guard configuration (`PROVIDER_*` or `PROVIDER_GROUPS_JSON`).
4. [ ] **Discovery:** provision a separate empty hosted Neon discovery database and set `DISCOVERY_DATABASE_URL`. Do not import the local fixture catalog into the live source database. Configure the worker and API for the same live source/roots.
5. [ ] **Indexer:** host Envio with RPC or HyperSync configuration and run `discovery:watch`; verify the live journal, finalized checkpoint and listing updates. Copy configured embedding vars to worker/web and generate live catalog embeddings.
6. [ ] **Analytics:** configure `ANALYTICS_DATABASE_URL` (public-data DB, separate from private accounts), `ANALYTICS_FROM_BLOCK`, migrate and run scanner. Optional reviewed facilitator file and read-only `ANALYTICS_LEDGER_DATABASE_URL` enable additional coverage.
7. [ ] **Paid name endpoint:** configure restricted issuance worker, fund Sepolia gas, publish its service records and align HTTP recipient/price with schema v3. Merchant namespace and service identity are separate.
8. [ ] **Buyer:** complete Privy browser login, approve scope, fund displayed payer with Base Sepolia USDC, execute a public purchase and verify payment plus delivery receipts.
9. [ ] **Full demo:** public onboarding -> indexed listing -> semantic search -> call instructions -> Guard -> settled purchase -> classified merchant totals. Rehearse wrong price/payTo, stale index, endpoint change, role revocation, retry and address rotation. Keep attack fixtures out of normal listings.

## Remaining boundaries to validate with real setup

- [ ] Full authenticated browser wallet journey with actual provider deployment and Safe signing. Current route/unit/fork checks do not replace a funded public walkthrough.
- [ ] Audit actual ancestor pointer, renewal/expiry, re-registration, alias/link, root/admin and upgrade powers before claiming platform-independent control. Prepare irreversible renunciation only after recovery tests; no renunciation is currently claimed.
- [ ] Verify hosted analytics coverage, finality/lag and historic association windows against real receipts. Address totals are not exact endpoint attribution, profit or global x402 revenue.

## Deliberately deferred

- Arbitrary `.eth` purchasing, dynamic pricing and service-version aliases.
- World, ERC-8004, session keys and additional payment chains/tokens.
- Exact service/order revenue attribution for shared recipients and automated refunds.
- Global ENS discovery beyond configured supported roots, unbounded/ANN search and fully permissionless platform admission.

Public discovery metadata is reconstructible; our hosted search/ranking remains one replaceable provider. Bazaar and x402scan have open discovery capabilities too. Compare shared source reconstruction, not invented exclusivity.
