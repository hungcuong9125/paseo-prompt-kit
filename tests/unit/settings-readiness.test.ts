import { describe, expect, it } from "vitest";
import { describeReadiness } from "../../client/settings/readiness.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

/**
 * The status line at the top of the settings screen. It is the one place a user
 * learns why the pill did nothing, so each refusal the rewrite path can produce
 * without a network call must be named here, from the same rules.
 */

const CATALOG = [
  {
    provider: "claude",
    label: "Claude",
    available: true,
    models: [
      {
        id: "claude-haiku-4-5",
        label: "Haiku 4.5",
        thinkingOptions: [{ id: "low", label: "Low" }],
        defaultThinkingOptionId: "low",
      },
    ],
  },
];

const ENDPOINT = {
  id: "groq",
  label: "Groq",
  protocol: "openai",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  models: ["openai/gpt-oss-20b"],
};

async function readiness(values: Record<string, unknown>, providers = CATALOG, enabledActionCount = 1) {
  return describeReadiness({
    values: await promptKitSettingsSchema.parseAsync(values),
    providers,
    enabledActionCount,
  });
}

describe("describeReadiness", () => {
  it("is ready on the defaults and names the path", async () => {
    const result = await readiness({});
    expect(result.kind).toBe("ready");
    expect(result.path).toBe("Provider CLI · current agent model");
  });

  it("is blocked, before anything else, when no action is enabled", async () => {
    const result = await readiness({}, CATALOG, 0);
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("expected blocked");
    expect(result.reason).toContain("no PromptKit pill");
  });

  it("waits for the catalog only when a dedicated CLI selection needs it", async () => {
    const dedicated = await readiness({ modelMode: "dedicated" }, null as never);
    expect(dedicated.kind).toBe("checking");
    const current = await readiness({}, null as never);
    expect(current.kind).toBe("ready");
    const api = await readiness(
      { transport: "api", apiEndpoints: [ENDPOINT], apiEndpointId: "groq", apiModel: "openai/gpt-oss-20b" },
      null as never,
    );
    expect(api.kind).toBe("ready");
  });

  it("carries the rewrite path's own refusal for a dedicated selection", async () => {
    const result = await readiness({
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-opus-5",
    });
    expect(result.kind).toBe("blocked");
    if (result.kind !== "blocked") throw new Error("expected blocked");
    expect(result.reason).toBe("Model is unavailable: claude/claude-opus-5");
    expect(result.path).toBe("Provider CLI · claude · claude-opus-5");
  });

  it("describes the API path by endpoint and model, or by mapped providers", async () => {
    const dedicated = await readiness({
      transport: "api",
      apiEndpoints: [ENDPOINT],
      apiEndpointId: "groq",
      apiModel: "openai/gpt-oss-20b",
    });
    expect(dedicated.kind).toBe("ready");
    expect(dedicated.path).toBe("Direct API · groq · openai/gpt-oss-20b");

    const mapped = await readiness({
      transport: "api",
      apiEndpoints: [ENDPOINT],
      apiEndpointByProvider: { opencode: "groq", pi: "groq" },
    });
    expect(mapped.kind).toBe("ready");
    expect(mapped.path).toBe("Direct API · agent model via 2 mapped providers");

    const unmapped = await readiness({ transport: "api" });
    expect(unmapped.kind).toBe("blocked");
  });
});
