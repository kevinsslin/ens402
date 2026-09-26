# ENS402 demo: one service, three outcomes

## What the audience should learn

A service name keeps its public API and payment configuration in ENS. Native ENSv2 permissions let Ops update the API URL while Treasury controls payment settings. A buyer compares the actual HTTP 402 request with this independent configuration before signing.

A receipt records the decision and, when paid, the transaction. The pre-payment comparison is **HTTP 402 payment requirement vs ENS**, not receipt vs payTo.

## Prepare before the presentation

1. Deploy the x402 endpoints. The included Search service returns clearly labeled sample data, not a real search product.
2. Complete the Sepolia namespace and ServiceRegistrar setup using `scripts/ens/README.md`. Registration stays unavailable until the deployed registrar and parent are configured.
3. Register `search.ens402.eth` with its dedicated native resolver, active status, API URL, Base Sepolia USDC and the merchant's recipient. This is a proposed demo name, not a claim of registration. The company hierarchy on the architecture page remains a separate proposal.
4. Use separate Admin, Ops and Treasury wallets. Admin controls resolver text and delegation; Ops gets `ROLE_SET_TEXT` on the endpoint key; Treasury gets that role on the payment key. Fund their Sepolia gas before the presentation.
5. Sign in to Console as the buyer. Resolve the service, approve a maximum payment of 0.01 USDC and a daily limit of 1 USDC, assuming the deployed endpoint is configured to charge 10000 atomic units. These are buyer limits, not a price quote.
6. For this controlled demo, explicitly approve all three exact endpoint URLs in Allowed API URLs. This lets later scenes demonstrate recipient verification rather than stopping earlier at an unapproved endpoint. For normal users, approve only endpoints they trust.
7. Use a managed wallet or an external signer. Fund the payer with Base Sepolia USDC; an external wallet also needs any network requirements for its chosen flow. Check its live balance. Confirm Intercepta and the facilitator work before presenting.

| Route | Behavior |
| --- | --- |
| `/api/merchant/search` | Normal 402 challenge, payment and sample response |
| `/api/merchant/search-v2` | Same recipient and price at an updated API URL |
| `/api/merchant/search-mismatch` | Deliberately different recipient; refuses every signed payment and never settles |

The routes derive their canonical origin from `MERCHANT_RESOURCE_URL`. Use those exact canonical URLs when registering and approving. The mismatch route derives a different recipient from `MERCHANT_PAY_TO`; ENS must retain the normal merchant recipient for this demonstration.

## Present in this order

1. **Merchant setup:** show the registered service and three wallet responsibilities. Deployment and funding are preparation, not live stage work.
2. **Normal purchase:** Buyer selects the name and buys once. Payment activity shows requested price, matching ENS/402 recipients, checks and confirmed transaction.
3. **Endpoint maintenance:** Ops changes only the endpoint to `search-v2`. Buyer resolves the same name and buys successfully within the prior explicit endpoint approval. The recipient is unchanged.
4. **Permission boundary:** use the Ops wallet to prepare a payment-recipient edit. Native resolver simulation must reject it. Do not give Ops root text rights.
5. **Tampered API:** Ops changes only the endpoint to `search-mismatch`. Buyer tries the same service. Activity shows the two different recipients and Blocked; no signature or settlement occurs.
6. Restore the normal endpoint after the demo.

## Verification boundaries

- Unit tests cover exact USDC conversion, expiry and recipient mismatch without signing.
- Integration tests exercise hosted and external-signer decisions with local PostgreSQL and provider doubles.
- Browser fixture checks verify layout and user-facing states; they do not prove a live Privy payment.
- A live stage run additionally requires deployed ENS permissions, funded wallets, real provider responses and a confirmed Base Sepolia transaction. Do not present local fixtures as those receipts.
