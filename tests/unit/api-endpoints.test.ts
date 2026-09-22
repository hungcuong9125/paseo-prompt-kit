import { describe, expect, it } from "vitest";
import {
  ENDPOINT_PRESETS,
  PROTOCOL_OPTIONS,
  endpointFromPreset,
  validateEndpoint,
} from "../../client/settings/api-endpoints.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

/**
 * The API endpoint section's pure half: the presets and the per-endpoint check.
 *
 * These are the rules that decide what reaches the settings document, so they are
 * tested without a DOM. A preset that produced an invalid endpoint, or a check
 * that let one through, would put an unusable endpoint in the document the daemon
 * reads — which is exactly what the check exists to prevent.
 */

describe("endpoint presets", () => {
  // A preset that does not satisfy the schema would be rejected by the host after
  // the user had already clicked it.
  it("every preset parses as a valid endpoint", async () => {
    for (const preset of ENDPOINT_PRESETS) {
      const endpoint = endpointFromPreset(preset);
      const parsed = await promptKitSettingsSchema.parseAsync({ apiEndpoints: [endpoint] });
      expect(parsed.apiEndpoints[0]?.id).toBe(preset.id);
      expect(parsed.apiEndpoints[0]?.protocol).toBe(preset.protocol);
    }
  });

  it("has unique ids", () => {
    const ids = ENDPOINT_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts every base URL at http or https", () => {
    for (const preset of ENDPOINT_PRESETS) {
      expect(preset.baseUrl).toMatch(/^https?:\/\//);
    }
  });

  // The local-server preset is the reason an empty key name must stay legal.
  it("includes a keyless preset for a local server", () => {
    const local = ENDPOINT_PRESETS.find((preset) => preset.apiKeyEnv === "");
    expect(local).toBeDefined();
    expect(local?.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1/);
  });

  it("covers all three protocols", () => {
    const protocols = new Set(ENDPOINT_PRESETS.map((preset) => preset.protocol));
    expect(protocols).toEqual(new Set(["openai", "anthropic", "gemini"]));
    // The picker must offer the same three, or a preset would be unreachable.
    expect(new Set(PROTOCOL_OPTIONS.map((option) => option.value))).toEqual(protocols);
  });
});

describe("validateEndpoint", () => {
  const valid = {
    id: "groq",
    label: "Groq",
    protocol: "openai" as const,
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
    models: [],
  };

  it("accepts a complete endpoint", () => {
    expect(validateEndpoint(valid, [], null)).toBeNull();
  });

  it("requires an id and a label", () => {
    expect(validateEndpoint({ ...valid, id: "" }, [], null)).toBe("An id is required.");
    expect(validateEndpoint({ ...valid, label: "  " }, [], null)).toBe("A label is required.");
  });

  it("rejects an id the schema would reject", () => {
    for (const id of [
      "Groq",
      "1 leading digit ok but caps no",
      "has space",
      "has_underscore",
      "-leading",
    ]) {
      expect(validateEndpoint({ ...valid, id }, [], null)).not.toBeNull();
    }
    // A digit first is allowed by the schema, so it must be allowed here too.
    expect(validateEndpoint({ ...valid, id: "1password" }, [], null)).toBeNull();
  });

  it("refuses an id another endpoint already uses", () => {
    expect(validateEndpoint(valid, [valid], null)).toContain("already uses the id");
  });

  // Editing an endpoint keeps its own id, so it must not collide with itself.
  it("allows an edited endpoint to keep its own id", () => {
    expect(validateEndpoint(valid, [valid], "groq")).toBeNull();
  });

  it("requires an http(s) base URL", () => {
    expect(validateEndpoint({ ...valid, baseUrl: "api.groq.com" }, [], null)).toContain("base URL");
    expect(validateEndpoint({ ...valid, baseUrl: "ftp://x" }, [], null)).toContain("base URL");
    expect(
      validateEndpoint({ ...valid, baseUrl: "http://127.0.0.1:1234/v1" }, [], null),
    ).toBeNull();
  });
});
