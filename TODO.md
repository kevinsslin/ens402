# ENS402 remaining work

Current scope: **Discover, Govern, Guard**. Namespace: **Platform Registry -> Provider Registry -> Service**, with one shared native resolver per provider. Start with [README.md](README.md); operator steps are in [SETUP.md](SETUP.md), test evidence in [AUDIT.md](AUDIT.md).

## Demo services and rehearsal

- [ ] In provider setup, choose **Set up one-transaction publishing**, deploy and authorize the replacement, and revoke the old registrar permissions. Existing Registry, Resolver and names are preserved. Owner signatures are required; verify the current publisher before deciding whether migration is needed.

- Existing demo `hello.demo.ens402.eth`: `/api/merchant/fixtures/hello` returns a paid JSON greeting.
- Existing weather and FX fixtures cover additional search intents; optionally add research. All are explicitly sample data, not live market/weather feeds.
- Demo endpoints share the configured `MERCHANT_PAY_TO` and cost `10000` atomic units (0.01 Base Sepolia USDC). The registering name owner must match that recipient.
- Use **Publish service -> Start with a demo**, review the prefilled metadata, then register with one transaction after upgrading the provider publisher. Older deployments retain commit/reveal until replaced.
- Rehearse: semantic search -> resolve ENS -> verify metadata/payment terms -> pay -> receive JSON. Use the existing mismatch endpoint to demonstrate a refused payment.
- Mocked settlement tests prove the delivery gate; a public funded purchase and final catalog sync remain required before claiming an end-to-end public demo.

## Demo critical path

- Services have been registered under `demo.ens402.eth`. Verify finalized catalog sync and search separately; registration alone does not prove indexing.
- Platform setup completed: native child registry `0xf537B10228b82726c9B0216d8a51097f6554e4CD` is linked to `ens402.eth`; owner authority verified at Sepolia block 11787963.
- Provider: configure the real Admin, Ops and Treasury wallets, publish services, then use **Refresh listings**. No always-on worker or Cron is required for this demo.
- Verify indexed listings and live semantic results, then fund the buyer with Base Sepolia USDC and rehearse Guard, payment and delivery.
- Search now distinguishes first-sync setup from an outage. Local tests and UI verification do not imply the public payment journey is complete.

## Metadata compatibility

- [ ] Optional compatibility: import arbitrary Bazaar/OpenAPI documents. The currently supported extension is explicitly an ENS402 format, not an official x402 standard.

## Public launch: operator inputs and signatures required

Local tests do not complete these steps. No mainnet transactions.

1. [x] **Platform owner:** native child registry linked and bootstrap registration roles verified on Sepolia (block 11787963). Existing root owner: `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`.
2. [ ] **Treasury:** choose the Treasury Admin wallet (EOA, multisig or MPC) and rehearse its signing. No Safe or contract-code requirement. For a contract service-name holder, deploy/control its Base Sepolia wallet and publish the destination signature proof.
3. [ ] **Provider:** complete `/provider` using the real Admin/Platform/Ops/Treasury Admin signers. Publish fixture services and a second independent provider; verify allowed/denied writes publicly with receipts. Add confirmed provider bindings to hosted Guard configuration (`PROVIDER_*` or `PROVIDER_GROUPS_JSON`).
4. [ ] **Discovery:** database and Vercel configuration are ready. Use the Next.js sync route with the same live source/roots and verify the first finalized service listing. Never import the local fixture catalog.
5. [ ] **Indexer:** verify the manual in-app bounded refresh. RPC reconstruction runs first; hosted Envio is an optional scaling path. Verify finalized checkpoints, listing updates and live catalog embeddings.
6. [ ] **Analytics:** hosted schema and web DB configuration are ready. Set the worker DB and `ANALYTICS_FROM_BLOCK`, then run the scanner and verify real receipts. Optional reviewed facilitator file and read-only `ANALYTICS_LEDGER_DATABASE_URL` enable additional coverage.
7. [ ] **Paid name endpoint:** configure restricted issuance worker, fund Sepolia gas, publish its service records and align HTTP recipient/price with schema v3. Merchant namespace and service identity are separate.
8. [ ] **Buyer:** complete Privy browser login, review the fixed-price checkout, fund displayed payer with Base Sepolia USDC, execute a public purchase and verify payment plus delivery receipts.
9. [ ] **Full demo:** public onboarding -> indexed listing -> semantic search -> call instructions -> Guard -> settled purchase -> classified merchant totals. Rehearse wrong price/payTo, stale index, endpoint change, role revocation, retry and address rotation. Keep attack fixtures out of normal listings.

## Remaining boundaries to validate with real setup

- [ ] After a real native ENS change, verify a nonempty MultiBaas event page and transaction link. Add each provider Registry/Resolver to MultiBaas before claiming provider-wide governance history. The four server-only variables are configured on Vercel Production and the public route returns 200 with an empty page; the free-plan 100-block backfill cap limits older changes.

- [ ] Full authenticated browser wallet journey with actual provider permissions and the chosen Treasury Admin wallet. Current route/unit/fork checks do not replace a funded public walkthrough.
- [ ] Audit actual ancestor pointer, renewal/expiry, re-registration, alias/link, root/admin and upgrade powers before claiming platform-independent control. Prepare irreversible renunciation only after recovery tests; no renunciation is currently claimed.
- [ ] Verify hosted analytics coverage, finality/lag and historic association windows against real receipts. Address totals are not exact endpoint attribution, profit or global x402 revenue.

## Deliberately deferred

- Arbitrary `.eth` purchasing, dynamic pricing and service-version aliases.
- World, ERC-8004, session keys and additional payment chains/tokens.
- Exact service/order revenue attribution for shared recipients and automated refunds.
- Global ENS discovery beyond configured supported roots, unbounded/ANN search and fully permissionless platform admission.

Public discovery metadata is reconstructible; our hosted search/ranking remains one replaceable provider. Bazaar and x402scan have open discovery capabilities too. Compare shared source reconstruction, not invented exclusivity.
