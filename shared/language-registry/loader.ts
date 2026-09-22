import { languageSchema, type OutputLanguage } from "./schema.js";

export interface RejectedLanguage {
  readonly source: string;
  readonly reason: string;
}

export interface LanguageRegistry {
  readonly languages: readonly OutputLanguage[];
  readonly rejected: readonly RejectedLanguage[];
}

function describeEntry(entry: unknown, index: number): string {
  if (entry !== null && typeof entry === "object" && "id" in entry) {
    const id = (entry as { id?: unknown }).id;
    if (typeof id === "string" && id !== "") return id;
  }
  return `#${index}`;
}

/** Same contract as the pack loader: bad entry rejected alone, duplicate id rejects both. */
export function loadLanguageRegistry(entries: readonly unknown[]): LanguageRegistry {
  const parsed: { source: string; language: OutputLanguage }[] = [];
  const rejected: RejectedLanguage[] = [];

  for (const [index, entry] of entries.entries()) {
    const source = describeEntry(entry, index);
    const result = languageSchema.safeParse(entry);
    if (!result.success) {
      const issue = result.error.issues[0];
      const path = issue?.path.join(".") ?? "";
      rejected.push({
        source,
        reason: `invalid language: ${path === "" ? "schema" : path} ${issue?.message ?? ""}`.trim(),
      });
      continue;
    }
    parsed.push({ source, language: result.data });
  }

  const counts = new Map<string, number>();
  for (const { language } of parsed) counts.set(language.id, (counts.get(language.id) ?? 0) + 1);

  const languages: OutputLanguage[] = [];
  for (const { source, language } of parsed) {
    if ((counts.get(language.id) ?? 0) > 1) {
      rejected.push({ source, reason: `duplicate language id: ${language.id}` });
      continue;
    }
    languages.push(language);
  }
  return { languages, rejected };
}
