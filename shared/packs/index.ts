import coding from "../packs/coding.json";

/**
 * The static pack barrel. Adding an action is one JSON file under
 * `shared/packs/` plus one line here; esbuild bundles both into the server
 * bundle at build time, which is the only distribution channel the host offers
 * (the daemon is never told where the plugin lives on disk).
 *
 * Values are `unknown` on purpose: the loader validates each entry against
 * `actionPackSchema` and rejects a bad one without touching the others.
 */
export const bundledPacks: readonly unknown[] = [coding];
