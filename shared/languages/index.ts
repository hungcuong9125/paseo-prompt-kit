import en from "../languages/en.json";
import vi from "../languages/vi.json";

/** Language barrel: one JSON per language, validated by the loader. `source` is built in. */
export const bundledLanguages: readonly unknown[] = [en, vi];
