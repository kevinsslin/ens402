# HuFu

**Protecting x402, so agents never pay the wrong party.**

No match, no payment. Ask a human only when it matters.

A hufu (tiger tally) was a bronze military token split into two halves: the ruler kept one, the general kept the other, and troops moved only when the halves matched. HuFu applies the same rule to x402 payments:

- **Match the tally.** The `payTo` in a 402 response must match the `payTo` the merchant pinned on its ENSv2 name. If it does not match, the agent does not pay.
- **Ask a human for big moves.** A new payee, a Medium risk verdict, a `payTo` that changed recently, or an amount over the cap requires fresh approval from the agent's owner through World ID for Agents.
- **Screen every payment.** Intercepta checks the payee address, the token, and the endpoint before the agent signs.

Built for ETHGlobal Tokyo 2026 (September 25–27), Classic track, solo. All handles use `hufu402` (GitHub, npm `@hufu402/*`, `hufu402.eth`).

## Docs

Planning docs live in `docs/` and are kept out of git (see `.gitignore`).

| Path | Contents |
|---|---|
| `docs/IDEA.md` | The full proposal: name origin, status quo, pain points, solution, architecture, feasibility, to-dos, demo, sponsors, red flags |
| `docs/research/world-id-for-agents.md` | World ID for Agents (Human Continuity IdP) research and prior art |
| `docs/research/ensv2-capabilities.md` | ENSv2 capabilities, including per-name and per-key resolver roles |
| `docs/reference/` | Snapshots of provider docs (x402, Intercepta, World IdP, ENSv2) and the Tokyo prize text |

## Status

Planning only. Under Classic track rules, all code, ENS registrations, and contract deployments happen after kickoff.
