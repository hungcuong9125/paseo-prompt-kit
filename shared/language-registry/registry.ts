import { bundledLanguages } from "../languages/index.js";
import { loadLanguageRegistry, type LanguageRegistry } from "./loader.js";
import { SOURCE_LANGUAGE, type OutputLanguage } from "./schema.js";

/** The one live language registry, filled at module load from the bundled barrel. */
const registry: LanguageRegistry = loadLanguageRegistry(bundledLanguages);

export function listLanguages(): LanguageRegistry["languages"] {
  return registry.languages;
}

export function listRejectedLanguages(): LanguageRegistry["rejected"] {
  return registry.rejected;
}

/** `source` → null (no instruction); loaded id → language; unknown → undefined. */
export function resolveLanguage(languageId: string): OutputLanguage | null | undefined {
  if (languageId === SOURCE_LANGUAGE) return null;
  return registry.languages.find((language) => language.id === languageId);
}
