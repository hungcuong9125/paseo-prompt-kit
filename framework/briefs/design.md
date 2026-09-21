# Design brief

Attach this file (by path) when dispatching a Peer for frontend UI/UX work.
It does not replace the seat role; it binds this assignment. All Peer laws
apply unchanged: single writable owner, path-scoped candidate commit, ait,
handback.

## Surface

Name the bound surface in the first reply and stay there:

- **Product UI** — authenticated consoles and app chrome. Honor the project's
  `DESIGN.md` and existing token/theme stack. No marketing aesthetic, no type
  system swap, no display webfonts the product language forbids.
- **Landing / marketing** — public pages only. Do not drag landing motion or
  stack defaults into the product tree.

If the packet does not name the surface, infer it from the assigned paths.
Mixed product + landing paths in one assignment is `RECONCILE_REQUIRED`.

## Skills

Lead attaches the relevant library skills per task. Typical picks:

- Product UI, one routine change: `frontend-design`.
- Product UI, spans multiple design concerns: `dembrandt` (orchestrator),
  `ui-density`, `form-design`, `operational-expert-tool-ui`,
  `wcag-accessibility`.
- Landing: `taste-skill`. Taste stack defaults (Next, Tailwind v4, Motion,
  GSAP, font swaps) are void when the assigned tree already has a stack.
- Existing-UI polish without migration: `redesign-skill`.

Never run the Dembrandt CLI/MCP or any URL-scraping token tool. Tokens come
from `DESIGN.md` and the assigned source.

Verify on the running app, not on the source: attach `agent-browser` and
prove each UI claim with a snapshot or screenshot of the page at the URL the
dispatch names.

## Judgment

The brief is an outcome boundary, not a prescribed look. Challenge a direction
that breaks the product language, accessibility, or an existing token file.
Do not offer Lead a menu of three moods — pick one coherent direction inside
the surface rules and ship it. Never migrate the CSS framework or design-token
library unless the packet names that migration.

## Completion

Standard Peer handback, plus the named surface (`product-ui` or `landing`).
