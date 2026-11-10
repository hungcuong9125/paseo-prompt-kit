import { useSyncExternalStore } from "react";
import enCatalog from "./locales/en.js";
import zhCatalog from "./locales/zh-CN.js";

/** Languages PromptKit ships. "auto" resolves from the device/browser locale. */
export type UiLanguage = "auto" | "en" | "zh-CN";
export const UI_LANGUAGES: readonly { value: UiLanguage; labelEn: string; labelNative: string }[] = [
  { value: "auto", labelEn: "Follow system", labelNative: "跟随系统" },
  { value: "en", labelEn: "English", labelNative: "English" },
  { value: "zh-CN", labelEn: "Chinese", labelNative: "中文" },
];

type Catalog = Record<string, string>;
const CATALOGS: Record<string, Catalog> = { en: enCatalog, "zh-CN": zhCatalog };
const FALLBACK = "en";

let current = "en";
let version = 0;
const listeners = new Set<() => void>();

/** The device/browser language PromptKit resolves "auto" against. */
export function deviceLanguage(): string {
  // The navigator speaks for browsers and the desktop shell; on a native
  // runtime there is none, and Intl answers for the device instead.
  try {
    const nav = globalThis as { navigator?: { language?: string; languages?: readonly string[] } };
    const tag = nav.navigator?.languages?.[0] ?? nav.navigator?.language ?? "";
    if (/^zh/i.test(tag)) return "zh-CN";
    if (/^[a-z]{2,3}(-|$)/i.test(tag)) return tag.slice(0, 2);
  } catch {
    // No navigator: fall through to Intl.
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (/^zh/i.test(locale)) return "zh-CN";
    if (/^[a-z]{2,3}(-|$)/i.test(locale)) return locale.slice(0, 2);
  } catch {
    // No Intl either: keep the fallback.
  }
  return FALLBACK;
}

/** The language "auto" means right here. */
export function autoLanguage(): string {
  return deviceLanguage() in CATALOGS ? deviceLanguage() : FALLBACK;
}

/**
 * Applies the saved `uiLanguage` setting ("auto" resolves here). Called by the
 * settings screen (draft preview), the client startup read, every save
 * announcement, and the sheet as soon as its settings read lands, so every
 * surface redraws in the same language.
 */
export function applyUiLanguage(setting: string): void {
  const next = setting === "auto" ? autoLanguage() : setting in CATALOGS ? setting : FALLBACK;
  if (next === current) return;
  current = next;
  version += 1;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not keep the rest in the old language.
    }
  }
}

export function subscribeI18n(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentI18nVersion(): number {
  return version;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

function translate(key: string, params?: Record<string, string | number>): string {
  const catalog = CATALOGS[current] ?? CATALOGS[FALLBACK]!;
  const text = catalog[key] ?? enCatalog[key] ?? key;
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (match: string, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Subscribes the calling component to language changes; returns the translator.
 * Helpers outside React (`readiness.ts`, `validation.ts`) read `tNow` during
 * their caller's render, which this hook keeps current.
 */
export function useI18n(): { t: Translate; language: string } {
  useSyncExternalStore(subscribeI18n, currentI18nVersion, currentI18nVersion);
  return { t: translate, language: current };
}

/** Non-hook translator for helpers invoked during a subscribed render. */
export const tNow: Translate = translate;
