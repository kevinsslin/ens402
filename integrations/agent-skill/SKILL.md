---
name: ens402-payments
description: Purchase approved x402 resources through ENS402 with a scoped agent credential or an independent signer.
---

# ENS402 agent payments

The human first approves a service, recipient, exact GET endpoints, amount limit, daily budget and expiry in the Console. A server runtime stores the resulting agent API key as `ENS402_AGENT_KEY`. Never ask for or expose the platform's Privy App Secret. Never place secrets in prompts or source code.

Use `ENS402Client` from `@ens402/sdk/platform` in this repository. The package is not published to npm yet. This Skill provides instructions, not an authenticated tool or a sandbox boundary; the host must expose SDK calls as tools.

1. Inspect the name covered by your key if you need current service metadata.
2. Persist a new UUID for one purchase attempt before calling `purchase({id, approvalId})`.
3. For an independent signer, call `purchaseWithSigner({id, approvalId, approval, signer})` with locally approved terms. Do not grant the model raw private-key access.
4. Return the resource only if the result confirms delivery. Payment settlement and successful delivery are distinct.
5. On a lost response, call `execution(id)`. Reuse the existing attempt; never generate a new ID as an automatic retry.
6. For `submitting` or `uncertain`, reconcile the actual transaction hash. Never assume the payment failed or budget was released.
7. If the service, recipient, authority or request scope changes, request human approval. The API key cannot create wallets, modify policy or approve another service.
8. Cancel only an unsent reserved attempt. Revocation cannot invalidate a payment authorization already signed and disclosed.

The supported hosted resource request is GET to the exact ENS-published URL. Arbitrary POST bodies, forwarded credentials, cross-origin redirects and smart-contract wallet signatures are not currently supported. Screening is Intercepta Ethereum-mainnet address evidence, not a service-quality guarantee. All payments use Base Sepolia test USDC.
