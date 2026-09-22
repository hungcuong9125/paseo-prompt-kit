# PromptKit extension guides

Each page is a follow-along recipe with a matching template in `docs/templates/`.
Architecture and module boundaries: `docs/CORE.md`. Overview of every extension point:
`docs/EXTENDING.md`.

| Want to | Read | Template | Touches TypeScript? |
|---|---|---|---|
| Add a prompt option (Action) to the pill menu | [action-packs.md](action-packs.md) | `action-pack.template.json` | No — one JSON + one barrel line |
| Add an output language to Settings | [output-languages.md](output-languages.md) | `output-language.template.json` | No — one JSON + one barrel line |
| Add an API protocol, CLI family, or settings field | `../EXTENDING.md` §2–4 | `api-protocol.template.ts.md`, `cli-family.template.ts.md`, `settings-section.template.tsx.md` | Yes |

After any change: `npm run gate` green, then `paseo plugin reload prompt-kit` and check on a
real host.
</content>
