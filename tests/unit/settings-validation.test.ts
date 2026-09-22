import { describe, expect, it } from "vitest";
import { describeTimeout, findSaveProblem } from "../../client/settings/validation.js";
import { promptKitSettingsSchema, TIMEOUT_MS } from "../../shared/settings.js";

/**
 * The pre-save check. It exists so the user gets a sentence naming the field
 * instead of the host's schema error, and so nothing the daemon would refuse is
 * ever written. Every boundary here is read from the schema's own constants.
 */

const ENDPOINT = {
  id: "groq",
  label: "Groq",
  protocol: "openai" as const,
  baseUrl: "https://api.groq.com/openai/v1",
  keySource: "env" as const,
  apiKeyEnv: "GROQ_API_KEY",
  models: [],
};

async function values(overrides: Record<string, unknown> = {}) {
  return promptKitSettingsSchema.parseAsync(overrides);
}

describe("findSaveProblem", () => {
  it("accepts the defaults", async () => {
    expect(findSaveProblem(await values())).toBeNull();
  });

  it("refuses a timeout one step outside either schema bound", async () => {
    const base = await values();
    expect(findSaveProblem({ ...base, timeoutMs: TIMEOUT_MS.min - 1 })).toContain("Timeout");
    expect(findSaveProblem({ ...base, timeoutMs: TIMEOUT_MS.max + 1 })).toContain("Timeout");
    expect(findSaveProblem({ ...base, timeoutMs: Number.NaN })).toContain("Timeout");
    expect(findSaveProblem({ ...base, timeoutMs: TIMEOUT_MS.min })).toBeNull();
    expect(findSaveProblem({ ...base, timeoutMs: TIMEOUT_MS.max })).toBeNull();
  });

  it("names the endpoint that cannot be saved", async () => {
    const base = await values();
    const problem = findSaveProblem({
      ...base,
      apiEndpoints: [{ ...ENDPOINT, baseUrl: "https://" }],
    });
    expect(problem).toContain('Endpoint "Groq"');
    expect(problem).toContain("base URL");
  });

  it("refuses a selection or mapping that names an endpoint the document lacks", async () => {
    const base = await values({ apiEndpoints: [ENDPOINT] });
    expect(findSaveProblem({ ...base, apiEndpointId: "absent" })).toContain('"absent"');
    expect(findSaveProblem({ ...base, apiEndpointByProvider: { pi: "absent" } })).toContain(
      'Provider "pi"',
    );
    expect(findSaveProblem({ ...base, apiEndpointId: "groq", apiEndpointByProvider: { pi: "groq" } })).toBeNull();
  });
});

describe("describeTimeout", () => {
  it("is silent inside the host's cap, notes above it, and errors outside the schema", () => {
    expect(describeTimeout(TIMEOUT_MS.hostRpcCapMs)).toEqual({ error: null, note: null });
    const above = describeTimeout(TIMEOUT_MS.hostRpcCapMs + 1);
    expect(above.error).toBeNull();
    expect(above.note).toContain(`${TIMEOUT_MS.hostRpcCapMs / 1000} s`);
    expect(describeTimeout(TIMEOUT_MS.max + 1).error).not.toBeNull();
    expect(describeTimeout(0.5 + TIMEOUT_MS.min).error).not.toBeNull();
  });
});
