# ENS402 remaining work

Current scope: **Discover, Govern, Guard**. Namespace: **Platform Registry -> Provider Registry -> Service**, with one shared native resolver per provider. Start with [README.md](README.md); operator steps are in [SETUP.md](SETUP.md), test evidence in [AUDIT.md](AUDIT.md).

## Demo services and rehearsal

- Publish `hello.demo.ens402.eth` first: `/api/merchant/fixtures/hello` returns a paid JSON greeting.
- Then publish weather, FX and research fixtures for distinct search intents. All are explicitly sample data, not live market/weather feeds.
- Demo endpoints share the configured `MERCHANT_PAY_TO` and cost `10000` atomic units (0.01 Base Sepolia USDC). The registering name owner must match that recipient.
- Use **Publish service -> Start with a demo**, review the prefilled metadata, then commit/reveal in the wallet. Publication still requires the user's signatures.
- Rehearse: semantic search -> resolve ENS -> verify metadata/payment terms -> pay -> receive JSON. Use the existing mismatch endpoint to demonstrate a refused payment.
- Mocked settlement tests prove the delivery gate; a public funded purchase and final catalog sync remain required before claiming an end-to-end public demo.

## Demo critical path

- Production database is reachable but has no catalog snapshot or services (verified September 27). Search cannot return real results until the first publication and sync.
- Platform setup completed: native child registry `0xf537B10228b82726c9B0216d8a51097f6554e4CD` is linked to `ens402.eth`; owner authority verified at Sepolia block 11787963.
- Provider: configure the real Admin, Ops and Treasury wallets, publish services, then use **Refresh listings**. No always-on worker or Cron is required for this demo.
- Verify indexed listings and live semantic results, then fund the buyer with Base Sepolia USDC and rehearse Guard, payment and delivery.
- Search now distinguishes first-sync setup from an outage. Local tests and UI verification do not imply the public payment journey is complete.

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

- [x] Provider onboarding finds current name owners and registry publishers from native events without requiring the service catalog. Existing providers link to management; first-time users see a guided wallet/name form. Ops/Treasury-only delegates can open a known provider by name. Demo discovery is bounded to 100 provider labels and roughly 200,000 blocks of registry history; longer histories require indexed provider enumeration.

## Registration preflight: implemented

- [x] Probe unsigned HTTP 402 and the supported `ens402.service` v1 extension. Review backend description, method, schemas, recipient and atomic price before applying them to the form.
- [x] Canonically compare description and complete call metadata, plus exact network/token/recipient/price. Missing schemas or unsupported metadata cannot pass as verified. Object key ordering is deterministic; array order remains significant.
- [x] Re-probe the committed draft immediately before commit and reveal. Editing fields discards the pending draft; transaction-time edits are disabled.
- [x] Pin metadata in buyer approvals and reject backend/ENS drift or verification removal before managed or SDK self-signing.
- [x] Metadata, probe and signing regressions pass. This is an application gate: contracts do not inspect HTTP. Legacy records remain metadata-unverified; actual response conformance and service quality are not proven.
- [ ] Optional compatibility: import arbitrary Bazaar/OpenAPI documents. The currently supported extension is explicitly an ENS402 format, not an official x402 standard.

## Platform setup and deployment preparation

- [x] `/provider` includes native platform bootstrap: deploy, validate receipt, link, re-read owner/grants. Unit tests and real ENS Anvil fork passed. Direct EOA deployment receipts supported; Safe internal execution is not implemented for platform bootstrap.
- [x] Separate hosted Neon discovery/analytics database created and migrated with a dedicated catalog role. Verified it can read zero private account tables. No local fixtures imported.
- [x] Vercel production discovery/analytics DB, embedding provider and ENS parent configuration added.
- [x] Persistent worker Docker image and Railway configuration prepared. Image builds and modules run as non-root; live one-cycle check correctly refuses the unlinked ENS root.
- [x] Default Next.js sync route, authenticated merchant refresh, PostgreSQL lease/cooldown, implemented; demo refresh is manual with no Cron schedule. Railway is optional.
- [ ] Verify successful finalized catalog synchronization after owner platform setup.

## Public launch: operator inputs and signatures required

Local tests do not complete these steps. No mainnet transactions.

1. [x] **Platform owner:** native child registry linked and bootstrap registration roles verified on Sepolia (block 11787963). Existing root owner: `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`.
2. [ ] **Treasury:** choose the Treasury Admin wallet (EOA, multisig or MPC) and rehearse its signing. No Safe or contract-code requirement. For a contract service-name holder, deploy/control its Base Sepolia wallet and publish the destination signature proof.
3. [ ] **Provider:** complete `/provider` using the real Admin/Platform/Ops/Treasury Admin signers. Publish fixture services and a second independent provider; verify allowed/denied writes publicly with receipts. Add confirmed provider bindings to hosted Guard configuration (`PROVIDER_*` or `PROVIDER_GROUPS_JSON`).
4. [ ] **Discovery:** database and Vercel configuration are ready. Use the Next.js sync route with the same live source/roots and verify the first finalized service listing. Never import the local fixture catalog.
5. [ ] **Indexer:** verify the manual in-app bounded refresh. RPC reconstruction runs first; hosted Envio and the Railway worker are optional scaling paths. Verify finalized checkpoints, listing updates and live catalog embeddings.
6. [ ] **Analytics:** hosted schema and web DB configuration are ready. Set the worker DB and `ANALYTICS_FROM_BLOCK`, then run the scanner and verify real receipts. Optional reviewed facilitator file and read-only `ANALYTICS_LEDGER_DATABASE_URL` enable additional coverage.
7. [ ] **Paid name endpoint:** configure restricted issuance worker, fund Sepolia gas, publish its service records and align HTTP recipient/price with schema v3. Merchant namespace and service identity are separate.
8. [ ] **Buyer:** complete Privy browser login, review the fixed-price checkout, fund displayed payer with Base Sepolia USDC, execute a public purchase and verify payment plus delivery receipts.
9. [ ] **Full demo:** public onboarding -> indexed listing -> semantic search -> call instructions -> Guard -> settled purchase -> classified merchant totals. Rehearse wrong price/payTo, stale index, endpoint change, role revocation, retry and address rotation. Keep attack fixtures out of normal listings.

## Remaining boundaries to validate with real setup

- [ ] Deploy the four server-only MultiBaas variables already configured on Vercel Production and verify the public activity route. After a real native ENS change, verify a nonempty indexed event page and transaction link. Add each provider Registry/Resolver to MultiBaas before claiming provider-wide governance history. The free-plan 100-block backfill cap limits older changes.

- [ ] Full authenticated browser wallet journey with actual provider deployment and Safe signing. Current route/unit/fork checks do not replace a funded public walkthrough.
- [ ] Audit actual ancestor pointer, renewal/expiry, re-registration, alias/link, root/admin and upgrade powers before claiming platform-independent control. Prepare irreversible renunciation only after recovery tests; no renunciation is currently claimed.
- [ ] Verify hosted analytics coverage, finality/lag and historic association windows against real receipts. Address totals are not exact endpoint attribution, profit or global x402 revenue.

## Deliberately deferred

- Arbitrary `.eth` purchasing, dynamic pricing and service-version aliases.
- World, ERC-8004, session keys and additional payment chains/tokens.
- Exact service/order revenue attribution for shared recipients and automated refunds.
- Global ENS discovery beyond configured supported roots, unbounded/ANN search and fully permissionless platform admission.

Public discovery metadata is reconstructible; our hosted search/ranking remains one replaceable provider. Bazaar and x402scan have open discovery capabilities too. Compare shared source reconstruction, not invented exclusivity.

## Onboarding reliability

- [x] Treasury Admin accepts EOAs, multisigs and MPC wallets. No contract-code requirement. Shared-provider Anvil setup and permission grants passed with an EOA Treasury Admin.
- [x] Setup uses a three-stage progress card with separate checking, wallet-confirmation and chain-confirmation states. Submitted transaction hashes and context are saved locally; receipt retries never resubmit.
- [x] Provider/platform gas estimation and receipt reads use server RPCs with batching and independent fallback. Service publication reads also avoid the wallet RPC. Wallet-internal simulation services remain controlled by the connected wallet.
