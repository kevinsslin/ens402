# User setup checklist

Updated September 26, 2026. All development and demo payments use testnets.

## Latest audit

See [AUDIT.md](AUDIT.md) for the current minimum native-only setup and paid registration endpoint. A fresh read at Sepolia block 11785763 still shows no child registry. The paid endpoint can use a dedicated native registrar worker without deploying ServiceRegistrar; the latter is only needed for the full-service `/register` page. Production fixed-price, service-name and worker settings remain pending.

## 1. Parent ownership verified

`ens402.eth` is registered on the supported ENSv2 Sepolia deployment. At block `11784285`, native `findOwner("ens402")` returned `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380`. The earlier zero-owner observation has been superseded by this confirmed read.

The parent currently has no child registry. `pnpm ens:namespace:plan` successfully generated `docs/setup/namespace-transactions.json` with the verified owner, deployment pin, observed block and intended role grants. No transaction has been sent. This wallet controls the platform namespace; each service registrant separately becomes that service's Admin.

## 2. Enable the namespace

For the paid-name demo, set `ENS_PARENT_NAME` and `ENS_OWNER_ADDRESS` locally and run `pnpm ens:namespace:plan --native-only`. Review `docs/setup/namespace-transactions.json`: the owner creates an official UserRegistry instance, points the parent to it, then grants only `ROLE_REGISTRAR` to a dedicated worker. No transaction has been sent. Fund the worker with Sepolia ETH.

Configure `ENS_PURCHASE_REGISTRY`, `ENS_PURCHASE_EXPIRY`, server-only `ENS_REGISTRATION_PRIVATE_KEY`, and `ENS_REGISTRATION_RESOURCE_URL` in Vercel. The worker wallet is separate from Admin, Ops, Treasury and the buyer.

Use the namespace owner's registrar authority to register `buy` directly to the service Admin in the native UserRegistry, initially without a resolver. Give the Admin the native set-resolver and associated administration rights. Then `pnpm ens:plan` prepares its dedicated resolver, records and scoped Ops/Treasury grants. Set `SERVICE_ENS_NAME`, `MERCHANT_PAY_TO`, `MERCHANT_PRICE_UNITS`, and `SERVICE_DESCRIPTION`; the registration URL must be the configured service endpoint. See `AUDIT.md` for the full inventory.

For optional full-service self-registration through `/register`, use the non-native-only plan and deploy our `ServiceRegistrar`, then grant it `ROLE_REGISTRAR` and set `SERVICE_REGISTRAR_ADDRESS`. This is separate from the paid-name merchant. `/register` stays disabled until configured. A service registration creates a native resolver and delegates its records; a paid-name purchase simply issues a name directly to its recipient without a resolver. A later name transfer does not automatically transfer an existing resolver's administration.

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

## Demo wallet assignments

Use three distinct wallets:

| Responsibility | Public address | Funding |
| --- | --- | --- |
| Platform owner / demo service Admin | `0x0D2FDDee5b84540A9766c025ad26dCaFb9FeF380` | Sepolia ETH for setup and grants |
| Ops endpoint writer | `0x03eEe8Be9682D6DF713563FDf7f8D1eD78d7479D` | Sepolia ETH for record updates |
| Treasury payment-record writer | `0x0Ca23D06479560bb9A916c19Df5a2948a8ed3346` | Sepolia ETH for record updates |

Ops and Treasury are freshly generated test-only wallets. Their keys are stored only in ignored root `.env` as `ENS_OPS_TEST_PRIVATE_KEY` and `ENS_TREASURY_TEST_PRIVATE_KEY`; the file is owner-readable/writable only. No roles have been granted and no transaction has been sent from them. The Admin key was not requested or copied. Funding these two writers does not fund the separate Base Sepolia USDC payer. The USDC receiving address remains `MERCHANT_PAY_TO`, an independent configuration.
