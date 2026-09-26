# ENS402 demo: discover, govern, guard, buy a name

## Primary demonstration

The paid API registers `<label>.ens402.eth` directly to a recipient on ENSv2 Sepolia. Base Sepolia USDC pays for the request. This is subname issuance, not an arbitrary `.eth` purchase or a subsequent transfer. The recipient receives the native name and its configuration rights; no resolver is attached to the purchased name.

### Prepare

1. Complete the native namespace setup in `AUDIT.md`. Run `pnpm ens:namespace:plan --native-only` for the unsigned parent-owner transactions. Fund and grant the dedicated worker only `ROLE_REGISTRAR`.
2. Publish a service such as `buy.ens402.eth` with its own native resolver, description, active status, registration endpoint and schema-v2 fixed USDC price. Use `pnpm ens:plan` for existing-service records and grants. The paid-name flow does not require the optional custom ServiceRegistrar.
3. Configure the production variables listed in `USER-TODO.md`. Keep the worker private key server-only. Check expiry and gas before presenting.
4. Sign in to Console, resolve the service, review the fixed price and approve the exact endpoint and buyer limits. Fund the displayed payer with Base Sepolia USDC.
5. Choose a fresh 3-32 character lowercase label and a recipient. Contract recipients must accept native ERC1155 transfers.

### Present

1. Show the service's public ENS description, endpoint and payment settings, plus the separate Admin, Ops and Treasury roles.
2. Select a label and recipient in Console. The reference app uses the same SDK available to other agents.
3. Explain the pre-signing check: compare HTTP 402 with ENS, check consent and screening evidence, then sign the exact request-bound payment.
4. Pay once. Show the Base Sepolia USDC receipt and the separate Sepolia name-registration receipt. Verify the recipient through the native registry.
5. Show the order status at `/api/merchant/registration-orders/<orderId>`. If delivery is pending, recover the existing order; do not create another payment.

An order contains a fresh UUID v4. ENS402 binds the endpoint and exact JSON body to the EIP-3009 nonce, so changing the recipient invalidates the signed order. This is an application convention that ordinary x402 clients must implement for this endpoint.

## Supporting governance and guarding scenes

The existing Search endpoints return clearly labeled sample data. Configure a separate service and approve the exact URLs used in the demonstration.

| Route | Behavior |
| --- | --- |
| `/api/merchant/search` | Normal 402 challenge, payment and sample response |
| `/api/merchant/search-v2` | Same recipient and price at an updated URL |
| `/api/merchant/search-mismatch` | Deliberately different recipient; never accepts or settles payments |

1. Ops changes the endpoint to `search-v2`. A fresh ENS resolution reaches the updated URL within the buyer's explicitly approved URL scope.
2. Ops attempts to change the payment record. Native EAC rejects the unauthorized edit.
3. Point to `search-mismatch`. The SDK rejects the HTTP recipient mismatch before signing.
4. Change the published fixed price using Treasury. Existing fixed-price consent requires renewed approval.
5. Restore the expected configuration.

Ops has individually scoped `ROLE_SET_TEXT` grants for endpoint, description and avatar. Treasury has the payment-key grant. Admin retains text administration. Scope grants to each service's own resolver; do not give Ops root text rights.

## Evidence and limits

Unit, PostgreSQL integration, native Solidity forks and the dual-Anvil paid-name flow pass. Live Intercepta and Privy policy checks pass. Browser checks cover public docs and setup-pending registration; an authenticated public purchase remains pending namespace activation and testnet funding. See `AUDIT.md` for exact coverage.

Payment and delivery are on separate chains. An unavailable name or reverted registration after settlement requires recovery or manual refund review. Public funded receipts are required before claiming a complete live deployment. Index reconstruction and version aliases remain planned.
