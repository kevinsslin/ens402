# ENS setup scripts

These commands generate unsigned JSON. They do not deploy, sign or grant roles.

## Choose one workflow

| Goal | Command | Output |
| --- | --- | --- |
| Enable native paid-name purchases only | `pnpm ens:namespace:plan --native-only` | `docs/setup/namespace-transactions.json` |
| Enable `ens402.eth` to issue full services | `pnpm ens:namespace:plan` | `docs/setup/namespace-transactions.json` |
| Configure an existing service name | `pnpm ens:plan` | `docs/setup/ens-transactions.json` |
| Register a new service under the enabled parent | `/register` in the app | Native commit/reveal signed by the service Admin |

Do not run both planners on the parent. The namespace parent is not automatically a paid service.

### Platform namespace

For `--native-only`, replace steps 4-6 below with a `ROLE_REGISTRAR` grant to a dedicated worker and configure `ENS_PURCHASE_REGISTRY` / `ENS_PURCHASE_EXPIRY`. See `AUDIT.md` for the server-only worker and merchant settings.

Set `SEPOLIA_RPC_URL`, `ENS_PARENT_NAME` and `ENS_OWNER_ADDRESS` in root `.env`.

1. Verify ownership on the pinned ENSv2 Sepolia deployment.
2. Deploy a native UserRegistry; the platform owner gets root `ROLE_REGISTRAR` and `ROLE_REGISTRAR_ADMIN`.
3. Point the parent at that registry.
4. Deploy ENS402 ServiceRegistrar.
5. Fill its creation address into the final native `ROLE_REGISTRAR` grant template.
6. After receipts are verified, configure `ENS_PARENT_NAME` and `SERVICE_REGISTRAR_ADDRESS` in Vercel.

The planner stops if the parent already has a child registry. It never silently replaces it. Only the initial native factory deployment can be simulated before the dependent contracts exist.

### Existing service

Set `SERVICE_ENS_NAME`, `ENS_OWNER_ADDRESS` (service Admin), `ENS_OPERATOR_ADDRESS` (Ops), `ENS_TREASURY_ADDRESS` (payment-record writer), `MERCHANT_RESOURCE_URL`, `MERCHANT_PAY_TO` (USDC receiver), `MERCHANT_PRICE_UNITS`, `SERVICE_DESCRIPTION`, optional `SERVICE_PICTURE_URL`, and `SEPOLIA_RPC_URL`.

The service Admin deploys a dedicated native resolver, writes records, grants Ops and Treasury their respective key-scoped `ROLE_SET_TEXT`, and publishes the resolver pointer last. Ops must differ from Admin and Treasury. Treasury may equal Admin but then retains Admin's broader permissions. The receiving address does not gain an ENS role simply because it receives money.

## Code ownership

- `shared.ts`: environment validation, deployment checks, ownership reads and plan output.
- `../namespace-plan.ts`: platform registry and registrar plan.
- `../ens-plan.ts`: one service's records and wallet grants.
- `../../contracts/src/ServiceRegistrar.sol`: atomic service registration, not permission enforcement.
- `../../packages/sdk/src/ens/current.ts`: pinned native deployment and current ABI.

Native ENS contracts enforce access. The scripts and SDK only prepare calldata. Every plan records its source deployment, observed block and intended wallet/resource/role grants. Recheck chain state before signing. No private key is needed to generate a plan.

## Verify after transactions confirm

Run `pnpm ens:permissions:check` using `SERVICE_ENS_NAME`, `ENS_OWNER_ADDRESS`, `ENS_OPERATOR_ADDRESS`, `ENS_TREASURY_ADDRESS` and `SEPOLIA_RPC_URL`. It writes `docs/validation/live-text-permissions.json` with the actual resolver, block, wallet, expected and observed permissions. A missing grant, unexpected broad text authority or unavailable read cannot pass. This check covers those wallets' text roles; registry and ancestor powers require separate review. Repeat after grant or resolver changes.
