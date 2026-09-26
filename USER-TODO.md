# User setup checklist

Updated September 26, 2026. All development and demo payments use testnets.

## 1. Confirm the registered parent deployment

The owner reports registering `ens402.eth` to `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`. On September 26, the pinned ENSv2 Sepolia registry still returned a zero owner and no subregistry. ENSv1 Sepolia also returned a zero owner. A transaction link or registration-app URL is needed to identify the actual network/deployment before preparing namespace transactions. Registration is reported by the owner but not yet verified on the supported deployment.

### Supported testnet registration

- Open **https://app.ens.dev**, the testnet app linked from https://docs.ens.domains/learn/deployments.
- Connect the wallet you want to own the namespace and use Sepolia, not mainnet.
- Search for `ens402.eth`. The current official Sepolia registrar reported `isAvailable("ens402") = true` during our September 26 check. Availability can change.
- Follow the app's testnet registration and payment-token instructions. Sepolia ETH may be needed for gas; do not assume the ENSv2 registrar charges native ETH. No mainnet purchase is needed for this demo.
- Send the registered name and owner address to the implementation task. Keep the owner wallet available to approve setup transactions.
- If the testnet app cannot register it, ask the ENS sponsor about the current Sepolia deployment and required test payment tokens. Our current integration pins source commit `71a3b7339dbc55ab47667abdfe8303bac4f4c24e`, UniversalResolver `0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3`, and PermissionedResolver implementation `0x14f09fd05d4585759e54844dc9b00147131cf243`.

Buying `ens402.eth` at **https://app.ens.domains** on mainnet is a separate optional purchase. It does not create ownership in the testnet deployment.

## 2. Enable the namespace

After the parent exists, set `ENS_PARENT_NAME` and `ENS_OWNER_ADDRESS` locally, run `pnpm ens:namespace:plan`, and review `docs/setup/namespace-transactions.json`. The planner prepares native UserRegistry and ServiceRegistrar deployment transactions without sending them. The registrar must be granted only native `ROLE_REGISTRAR` on that child registry. The parent must point to that registry. Set `ENS_PARENT_NAME` and `SERVICE_REGISTRAR_ADDRESS` in Vercel after verifying the transactions.

The `/register` page stays explicitly disabled until these settings exist. Each successful registration creates a dedicated native resolver, configures x402 records, separates endpoint and Treasury delegates, transfers resolver administration to the registering wallet, and removes the registrar's resolver privileges. Names expire at the configured namespace expiry. A later name transfer does not automatically transfer the separate resolver administration. Parent control and expiry remain visible trust assumptions.

## 3. Privy browser login

The local app credentials passed real signing and policy rejection tests. In the Privy dashboard, allow `https://ens402.vercel.app` as an app origin, enable email and/or wallet login, and complete one real login from `/console`. This human login is separate from the automated server signing test. The public app ID is rendered to the browser; the app secret remains server-only.

## 4. Fund and demonstrate

Sign in, inspect a configured service, choose managed or self signing, and approve the exact scope. Fund only the payer address shown with **Base Sepolia USDC**, then perform a purchase. Do not send mainnet funds. Managed wallets are controlled by the platform; this testnet prototype does not yet offer a general withdrawal UI. Use small test balances.

## Already handled

- Neon `ens402-db` created through Vercel Marketplace and connected to production.
- Production schema migrated and database health checked.
- Unusable localhost production DATABASE_URL removed.
- Removed unused `HUFU_LARGE_PAYEE_ATOMIC`, `HUFU_DAILY_CAP_ATOMIC`, `HUFU_PER_PAYMENT_CAP_ATOMIC`, and `POLICY_ORIGIN`.
- Local PostgreSQL remains separate for disposable integration tests.
