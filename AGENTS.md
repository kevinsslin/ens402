# AGENTS.md

HuFu (`hufu402`) is a payee verification layer for x402 payments. Read `docs/IDEA.md` first: it is the single source of truth for the product and the architecture. `docs/` is local only and ignored by git.

## Rules

- Classic track: no product code before kickoff (2026-09-25). Only docs change until then.
- Develop and test on testnets and the World sandbox only: ENSv2 on Sepolia, x402 payments on Base Sepolia (`eip155:84532`).
- For integration details, use the provider doc snapshots in `docs/reference/`. If they disagree with the live docs, trust the live docs and refresh the snapshot.
- API keys go in `.env` only, never in git.
- Write everything (code, comments, docs, commits) in English. Never use em dashes (U+2014).
