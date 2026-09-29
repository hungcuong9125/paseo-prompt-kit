import en from "../languages/en.json";
import vi from "../languages/vi.json";
import ja from "../languages/ja.json";
import zh from "../languages/zh.json";
import ko from "../languages/ko.json";
import es from "../languages/es.json";
import fr from "../languages/fr.json";
import de from "../languages/de.json";

/** Language barrel: one JSON per language, validated by the loader. `source` is built in. */
export const bundledLanguages: readonly unknown[] = [en, vi, ja, zh, ko, es, fr, de];
