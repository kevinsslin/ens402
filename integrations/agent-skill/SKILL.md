---
name: ens402-payments
description: Purchase approved x402 resources through ENS402 with a scoped agent credential or an independent signer.
---

# ENS402 agent payments

The human first approves a service, recipient, exact endpoints, amount limit, daily budget and expiry in the Console. A server runtime stores the resulting agent API key as `ENS402_AGENT_KEY`. Never ask for or expose the platform's Privy App Secret. Never place secrets in prompts or source code.

Use `ENS402Client` from `@ens402/sdk/platform` in this repository. The package is not published to npm yet. This Skill provides instructions, not an authenticated tool or a sandbox boundary; the host must expose SDK calls as tools.

1. Inspect the name covered by your key if you need current service metadata.
2. Persist a new UUID for one purchase attempt before calling `purchase({id, approvalId})`.
3. For an independent signer, call `purchaseWithSigner({id, approvalId, approval, signer})` with locally approved terms. Do not grant the model raw private-key access.
4. Return the resource only if the result confirms delivery. Payment settlement and successful delivery are distinct.
5. On a lost response, call `execution(id)`. Reuse the existing attempt; never generate a new ID as an automatic retry.
6. For `submitting` or `uncertain`, reconcile the actual transaction hash. Never assume the payment failed or budget was released.
7. If the service, recipient, authority or request scope changes, request human approval. The API key cannot create wallets, modify policy or approve another service.
8. Cancel only an unsent reserved attempt. Revocation cannot invalidate a payment authorization already signed and disclosed.

The hosted resource supports GET or bounded JSON POST to the exact ENS-published URL. POST requires a UUID v4 orderId and merchant support for ENS402 request binding; pass the same request bytes through preparation and signing. Forwarded credentials, cross-origin redirects and smart-contract wallet signatures are not supported. Screening is Intercepta Ethereum-mainnet address evidence, not a service-quality guarantee. All payments use Base Sepolia test USDC.

Discovery is not implemented yet. This Skill provides payment instructions only; it does not expose a search tool or an MCP server. See the repository README for current scope.
