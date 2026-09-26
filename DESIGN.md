# ENS402 interface

## Visual system

Light surfaces, Satoshi typography and blue accents follow ENS Thorin references. The existing shadcn components remain the implementation. ENS402 retains its independent identity. Official ENS and Intercepta assets identify the integrations, not sponsorship or endorsement. Sources are in apps/web/public/brands/README.md.

Core text/action colors against white: blue #0054cc (6.69:1), muted #56657a (5.94:1), error #b42318 (6.57:1). Decorative gradients use the ENS blue palette. No critical state depends on color alone.

## Walkthrough

- User-initiated playback, 4.2 seconds per step, no loop.
- Pause/resume retains the current step; previous/next and direct step selection are available.
- Scenario changes reset playback. Recipient mismatch stops at Verify and disables later steps.
- Offscreen/hidden-tab playback pauses. Reduced-motion users get manual controls and no CSS motion.
- Scenario and playback controls have 44px minimum height; stage state is exposed via aria-current and verdicts via a polite live region.
- The demo identifies fixture data and never sends a payment.

## Validation, September 26, 2026

Production build passed. Browser checks covered desktop and 390px mobile landing, the wrong-recipient stopped state, normal playback completion, pause/resume preserving step 2, and reduced-motion manual navigation. Public console and architecture were inspected after the global light-theme change. Live authenticated payment acceptance remains gated by provider setup in SETUP.md.
