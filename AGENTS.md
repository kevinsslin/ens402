# AGENTS.md

ENS402 (formerly HuFu) is an ENS-based public service configuration and payment verification stack for x402. Read `docs/IDEA.md` first and `docs/DESIGN-CLARIFICATIONS.md` for current boundaries. Earlier `docs/CONTRACTS.md` and `docs/REVIEW.md` retain useful technical checks but describe the superseded hosted-buyer proposal where marked. Historical proposals are in `docs/archive/`. `docs/` is local only and ignored by Git.

## Rules

- User override, 2026-09-25: this repository is for exploration and testing and will not be submitted to the hackathon. The user explicitly removed the pre-kickoff restriction here; implementation and test harnesses may proceed now. This does not establish eligibility of any future submission or authorize treating prior work as newly created.
- Develop and test on testnets only: ENSv2 on Sepolia, x402 payments on Base Sepolia (84532), and World in its sandbox if retained.
- Use relevant provider snapshots in `docs/reference/`. Prefer current official docs and deployed ABIs when they disagree; refresh the snapshot.
- Keep API keys in `.env` only, never in Git or output. Preserve existing private `.env.local` during cleanup; migrate settings deliberately when implementation starts.
- Write code, comments, docs, and commits in English. Never use em dashes (U+2014).
- Use shadcn/ui for the frontend and Vercel for the hackathon site.
- User requirement: make native ENSv2 Registry/Resolver EAC permissions central to the product and demo. Merely inheriting the EAC library for custom application roles or publishing a policy-contract pointer in ENS does not satisfy this requirement. Application glue may enforce business rules, but distinguish it from native ENS permissions.
- Separate user decisions, proposed defaults, and verified integrations. The new EAC product design and provider setup remain open. Do not restore the entire previous payment scope automatically.
- Keep the core wallet-provider independent. Provider policies, World approvals, and ERC-8004 reputation are adapters or future inputs, not required core accounts. SDK packaging is not hard wallet enforcement.
- Use ENS402 for current branding and `ens402.payment` / `ens402.status` for the proposed application records. These are not official ENS/x402 standards. Preserve old names in historical test evidence.
