import { describe, expect, it } from "vitest";
import { validateDedicatedSelection } from "../../client/settings/selection.js";
import { promptKitSettingsSchema } from "../../shared/settings.js";

/**
 * The pre-flight check the client runs before it calls the rewrite RPC.
 *
 * It exists so a misconfiguration becomes a readable message instead of a failed
 * round trip, and so the Composer text is never touched for a selection that
 * cannot run. It is checked here rather than through the DOM because the rules are
 * pure: they read settings and a provider catalog, nothing else.
 */

const ENDPOINT = {
  id: "groq",
  label: "Groq",
  protocol: "openai",
  baseUrl: "https://api.groq.com/openai/v1",
  apiKeyEnv: "GROQ_API_KEY",
  models: ["openai/gpt-oss-20b"],
};

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

async function values(overrides: Record<string, unknown> = {}) {
  return promptKitSettingsSchema.parseAsync(overrides);
}

describe("validateDedicatedSelection: cli transport", () => {
  it("accepts the current model with no further configuration", async () => {
    expect(validateDedicatedSelection(await values({}), CATALOG)).toBeNull();
  });

  it("requires a complete dedicated selection", async () => {
    const settings = await values({ modelMode: "dedicated", dedicatedProvider: "claude" });
    expect(validateDedicatedSelection(settings, CATALOG)).toBe(
      "Select a dedicated provider and model.",
    );
  });

  it("refuses an unavailable provider and an unlisted model", async () => {
    const missingProvider = await values({
      modelMode: "dedicated",
      dedicatedProvider: "unknown",
      dedicatedModel: "model-x",
    });
    expect(validateDedicatedSelection(missingProvider, CATALOG)).toBe(
      "Provider is unavailable: unknown",
    );

    const missingModel = await values({
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-opus-5",
    });
    expect(validateDedicatedSelection(missingModel, CATALOG)).toBe(
      "Model is unavailable: claude/claude-opus-5",
    );
  });

  it("refuses a stale thinking option", async () => {
    const settings = await values({
      modelMode: "dedicated",
      dedicatedProvider: "claude",
      dedicatedModel: "claude-haiku-4-5",
      dedicatedThinkingOptionId: "max",
    });
    expect(validateDedicatedSelection(settings, CATALOG)).toBe(
      "Thinking option is unavailable: max",
    );
  });

  // The API rules are not the CLI rules, so a CLI provider must not be required.
  it("ignores the CLI selection entirely on the api transport", async () => {
    const settings = await values({
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [ENDPOINT],
      apiEndpointId: "groq",
      apiModel: "openai/gpt-oss-20b",
    });
    expect(validateDedicatedSelection(settings, [])).toBeNull();
  });
});

describe("validateDedicatedSelection: api transport", () => {
  // Model source belongs to the CLI; the API path reads its model from the endpoint section.
  it("ignores modelMode on the api transport", async () => {
    const complete = { transport: "api", apiEndpoints: [ENDPOINT], apiEndpointId: "groq", apiModel: "openai/gpt-oss-20b" };
    expect(validateDedicatedSelection(await values({ ...complete, modelMode: "current" }), CATALOG)).toBeNull();
    expect(validateDedicatedSelection(await values({ ...complete, modelMode: "dedicated" }), CATALOG)).toBeNull();
  });

  it("accepts a provider mapping with no endpoint selected", async () => {
    const settings = await values({
      transport: "api",
      apiEndpoints: [ENDPOINT],
      apiEndpointByProvider: { opencode: "groq" },
    });
    expect(validateDedicatedSelection(settings, CATALOG)).toBeNull();
  });

  it("asks for an endpoint when none is selected", async () => {
    const settings = await values({ transport: "api" });
    expect(validateDedicatedSelection(settings, CATALOG)).toBe(
      "Add an API endpoint and select it before rewriting over the API.",
    );
  });

  it("names an endpoint id that no endpoint defines", async () => {
    const settings = await values({
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [ENDPOINT],
      apiEndpointId: "absent",
    });
    expect(validateDedicatedSelection(settings, CATALOG)).toBe(
      'No API endpoint is configured with the id "absent".',
    );
  });

  it("requires a model and refuses one the endpoint does not declare", async () => {
    const noModel = await values({
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [ENDPOINT],
      apiEndpointId: "groq",
    });
    expect(validateDedicatedSelection(noModel, CATALOG)).toBe("Select an API model.");

    const badModel = await values({
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [ENDPOINT],
      apiEndpointId: "groq",
      apiModel: "not-listed",
    });
    expect(validateDedicatedSelection(badModel, CATALOG)).toBe(
      'Model is unavailable on endpoint "groq": not-listed',
    );
  });

  // An endpoint that declares no models is legitimate (a local server), so the
  // check must not turn "no list" into "nothing is allowed".
  it("accepts any model when the endpoint declares none", async () => {
    const settings = await values({
      transport: "api",
      modelMode: "dedicated",
      apiEndpoints: [{ ...ENDPOINT, models: [] }],
      apiEndpointId: "groq",
      apiModel: "whatever-the-server-has",
    });
    expect(validateDedicatedSelection(settings, CATALOG)).toBeNull();
  });
});
