# HuFu

**Payee verification for x402 agents.** No match, no payment. Ask a human only when authority expands.

Policy site: [hufu402.vercel.app](https://hufu402.vercel.app). The payment and approval integrations are still being connected.

HuFu is an SDK-mediated payment authorization layer for x402 agents. It compares each x402 `payTo` with a merchant-controlled ENSv2 record before an agent creates a payment signature. ENSv2 separates permission to update a service endpoint from permission to change its payment address. Intercepta screens the address; World ID for Agents authorizes new payees and larger payments. Each signed policy decision has a receipt at `/decisions/<attempt-id>` with the authority, risk, limits, approval, and settlement state.

ETHGlobal Tokyo 2026. Testnets and World sandbox only. This checkout contains pre-kickoff implementation authorized by the project owner; Classic eligibility needs organizer confirmation.

The product and architecture brief is `docs/IDEA.md` in this local checkout. `docs/` is gitignored; its `reference/` directory keeps integration-specific provider snapshots. Current provider docs and deployed contract ABIs take precedence over snapshots.

## Local workflow

```sh
pnpm install
cp .env.example .env.local
pnpm build
pnpm test
pnpm --filter @hufu402/web ens:preflight
```

Configure private values in the repository-root `.env.local`; the local web app, merchant, agent, and scripts load it. Vercel production variables must be set separately. Run `pnpm --filter @hufu402/web migrate` against transactional Postgres, then `pnpm dev` for the policy site. `pnpm test:db` exercises the policy and risk cache against that database. `pnpm --filter @hufu402/web ens:safe-plan` prepares Sepolia Safe calldata after the Safe, Ops, payee, and service addresses are set. The plan simulates factory deployments; review all transactions and onchain state before signing. After deployment, set `ENS_RESOLVER_DEPLOY_BLOCK` to the block containing the factory's resolver `ProxyDeployed` event and run `pnpm --filter @hufu402/web ens:role-readback` to verify ownership, records, and scoped Ops permissions against Sepolia.

The SDK is in `packages/sdk`, the policy site in `apps/web`, the x402 merchant in `apps/merchant`, and the payer CLI in `apps/agent`. The CLI accepts `--discover "search phrase"` to rank Bazaar candidates whose ENS endpoint and payee match; it then requires the live 402 price to match the selected catalog price. When World approval is needed, the CLI prints the link, waits for the verified approval, and resumes the same signed payment intent. Use `--no-wait` to print the approval link and exit. Live World, Intercepta, ENS, CDP, and payment integration still need the credentials and testnet assets listed in the local `docs/STATUS.md`.
