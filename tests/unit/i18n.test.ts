import { afterEach, describe, expect, it } from "vitest";
import { applyUiLanguage, autoLanguage, deviceLanguage, tNow, UI_LANGUAGES } from "../../client/i18n/core.js";
import { localizedRewriteError } from "../../client/i18n/errors.js";
import en from "../../client/i18n/locales/en.js";
import zh from "../../client/i18n/locales/zh-CN.js";

/** Collects the leaf strings of one catalog for set comparison. */
function keys(catalog: Record<string, string>): Set<string> {
  return new Set(Object.keys(catalog));
}

describe("ui language catalogs", () => {
  it("carries exactly the same key set in every shipped language", () => {
    expect(keys(zh as Record<string, string>)).toEqual(keys(en as Record<string, string>));
  });

  it("never ships an empty translation", () => {
    for (const [key, value] of Object.entries(zh as Record<string, string>)) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("interpolates named parameters and keeps unknown placeholders verbatim", () => {
    applyUiLanguage("en");
    expect(tNow("status.ready", { path: "Provider CLI · current agent model" })).toBe(
      "Configured · Provider CLI · current agent model",
    );
    expect(tNow("actions.alwaysOn", { hint: "Custom · x" })).toBe("Always on · Custom · x");
    expect(tNow("engine.output.missing", { id: "xx" })).toContain('"xx"');
  });
});

describe("language resolution", () => {
  afterEach(() => {
    applyUiLanguage("auto");
  });

  it("resolves auto through the device language, with an English fallback", () => {
    const device = deviceLanguage();
    expect(autoLanguage()).toBe(device);
    applyUiLanguage("auto");
    expect(["en", "zh-CN"]).toContain(device === "zh-CN" ? "zh-CN" : device);
  });

  it("follows an explicit choice even when the device disagrees", () => {
    applyUiLanguage("zh-CN");
    expect(tNow("interface.title")).toBe("界面");
    applyUiLanguage("en");
    expect(tNow("interface.title")).toBe("Interface");
  });

  it("falls back to English for a language PromptKit does not ship", () => {
    applyUiLanguage("ko");
    expect(tNow("interface.title")).toBe("Interface");
  });

  it("lists every shipped language in the picker options", () => {
    for (const entry of UI_LANGUAGES) {
      if (entry.value !== "auto") {
        expect(Object.keys(en)).toContain(`language.${entry.value}`);
      }
    }
  });
});

describe("rewrite error localization", () => {
  it("translates every known code", () => {
    applyUiLanguage("en");
    for (const code of ["timeout", "generation_failed", "empty_output", "spawn_failed"]) {
      const message = localizedRewriteError(code, `raw ${code}`, 25_000);
      expect(message, code).not.toMatch(/^raw /);
      expect(message).not.toBe(code);
    }
  });

  it("passes an unknown code's server message through untouched", () => {
    applyUiLanguage("en");
    expect(localizedRewriteError("mystery_code", "raw server text", 25_000)).toBe("raw server text");
  });

  it("phrases the timeout verdict in the current language with the effective seconds", () => {
    applyUiLanguage("en");
    const message = localizedRewriteError("timeout", "", 27_000);
    expect(message).toContain("27 s");
  });
});
