import en from "../languages/en.json";
import vi from "../languages/vi.json";

/**
 * The static language barrel. Adding an output language is one JSON file under
 * `shared/languages/` plus one line here; esbuild bundles both at build time,
 * the same way action packs are bundled (see `shared/packs/index.ts`).
 *
 * "Keep the prompt's own language" is not an entry: it is the built-in default
 * `SOURCE_LANGUAGE`, which adds no instruction at all.
 *
 * Values are `unknown` on purpose: the loader validates each entry against
 * `languageSchema` and rejects a bad one without touching the others.
 */
export const bundledLanguages: readonly unknown[] = [en, vi];
