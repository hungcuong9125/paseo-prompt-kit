import { describe, expect, it } from "vitest";
import {
  isDedicatedSelectionComplete,
  promptKitSettings,
  promptKitSettingsSchema,
} from "../../shared/settings.js";

describe("prompt kit settings", () => {
  it("parses an empty document into defaults", async () => {
    const values = await promptKitSettingsSchema.parseAsync({});
    expect(values).toEqual({
      modelMode: "current",
      transport: "cli",
      dedicatedProvider: null,
      dedicatedModel: null,
      dedicatedThinkingOptionId: null,
      providerCli: {},
      apiEndpoints: [],
      apiEndpointId: null,
      apiModel: null,
      apiEndpointByProvider: {},
      secretsFile: null,
      timeoutMs: 90_000,
      actionEnabled: {},
      outputLanguage: "source",
    });
  });

  it("maps a provider id to a CLI family, defaulting to none", async () => {
    const values = await promptKitSettingsSchema.parseAsync({});
    // No mapping is invented: an id that names no supported CLI fails closed.
    expect(values.providerCli).toEqual({});
    const mapped = await promptKitSettingsSchema.parseAsync({
      providerCli: { "compat-peer": "opencode" },
    });
    expect(mapped.providerCli).toEqual({ "compat-peer": "opencode" });
  });

  it("treats an absent action toggle as the pack default and an explicit one as the user's choice", async () => {
    const values = await promptKitSettingsSchema.parseAsync({
      actionEnabled: { coding: false },
    });
    expect(values.actionEnabled).toEqual({ coding: false });
    // A key the document does not carry is absent, not false: the pack's own
    // `enabledByDefault` decides, so a newly added pack needs no migration.
    expect(values.actionEnabled["other"]).toBeUndefined();
  });

  it("is a version 1 host-scoped definition with the plugin id", () => {
    expect(promptKitSettings.id).toBe("prompt-kit");
    expect(promptKitSettings.version).toBe(1);
    expect(promptKitSettings.scope).toBe("host");
  });

  it("rejects an out-of-range timeout", async () => {
    await expect(promptKitSettingsSchema.parseAsync({ timeoutMs: 0 })).rejects.toThrow();
    await expect(promptKitSettingsSchema.parseAsync({ timeoutMs: 900_000 })).rejects.toThrow();
  });

  it("treats an incomplete dedicated selection as incomplete", async () => {
    const incomplete = await promptKitSettingsSchema.parseAsync({
      modelMode: "dedicated",
      dedicatedProvider: "claude",
    });
    expect(isDedicatedSelectionComplete(incomplete)).toBe(false);
    const complete = await promptKitSettingsSchema.parseAsync({
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-opus-5",
    });
    expect(isDedicatedSelectionComplete(complete)).toBe(true);
  });
});

describe("provider CLI mapping", () => {
  it("accepts a supported family id and rejects an unknown one", async () => {
    const values = await promptKitSettingsSchema.parseAsync({
      providerCli: { "compat-peer": "opencode", "pi-peer": "pi" },
    });
    expect(values.providerCli).toEqual({ "compat-peer": "opencode", "pi-peer": "pi" });
    await expect(
      promptKitSettingsSchema.parseAsync({ providerCli: { "grok-peer": "gemini" } }),
    ).rejects.toThrow();
  });
});
