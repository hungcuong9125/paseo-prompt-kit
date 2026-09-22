import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { promptKitSettingsSchema, TIMEOUT_MS } from "../../shared/settings.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock("@getpaseo/plugin/client/ui", async () => (await import("./mocks.js")).pluginUiMock);

const holder = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
  save: vi.fn(),
  listProviders: vi.fn(),
  listActions: vi.fn(),
  testEndpoint: vi.fn(),
  keyStatus: vi.fn(),
  writeKey: vi.fn(),
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => holder.state,
  useRpc: (contract: { name: string }) => {
    if (contract.name === "prompt-kit.providers") return holder.listProviders;
    if (contract.name === "prompt-kit.api.test") return holder.testEndpoint;
    if (contract.name === "prompt-kit.secrets.status") return holder.keyStatus;
    if (contract.name === "prompt-kit.secrets.write") return holder.writeKey;
    return holder.listActions;
  },
}));

import { PromptKitSettingsScreen } from "../../client/settings/settings-screen.js";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

const theme = {
  colors: {
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#999",
    accent: "#0af",
    accentForeground: "#000",
    statusSuccess: "#0f0",
    statusWarning: "#ff0",
    statusDanger: "#f00",
  },
} as unknown as PluginSurfaceProps["theme"];

const surfaceProps = {
  theme,
  host: { id: "host-1", label: "Local" },
  layout: { compact: false, platform: "web" },
} satisfies PluginSurfaceProps;

const catalog = {
  providers: [
    {
      provider: "openai",
      label: "OpenAI",
      available: true,
      models: [
        {
          id: "gpt-5",
          label: "GPT-5",
          thinkingOptions: [{ id: "high", label: "High" }],
          defaultThinkingOptionId: "high",
        },
      ],
    },
    { provider: "ghost", label: "Ghost", available: false, models: [] },
  ],
};

const defaults = promptKitSettingsSchema.parse({});

const actionCatalog = {
  actions: [
    {
      id: "coding",
      version: 1,
      enabledByDefault: true,
      title: "Improve coding prompt",
      description: "Rewrite the current request for a coding agent.",
      icon: "Code2",
    },
  ],
};

const GEMINI = {
  id: "gemini",
  label: "Google Gemini",
  protocol: "gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  keySource: "env",
  apiKeyEnv: "GEMINI_API_KEY",
  accountIdVar: "",
  models: ["gemini-2.5-flash-lite"],
};

function readyState(values: Record<string, unknown>): Record<string, unknown> {
  return {
    status: "ready",
    values: { ...defaults, ...values },
    revision: "r1",
    saving: false,
    saveError: null,
    save: holder.save,
    reset: async () => true,
    reload: async () => {},
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(): Promise<HTMLDivElement> {
  holder.listActions.mockResolvedValue(actionCatalog);
  holder.listProviders.mockResolvedValue(catalog);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PromptKitSettingsScreen {...surfaceProps} />);
  });
  await flush();
  return container;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function statusTitle(view: HTMLDivElement): string {
  return view.querySelector('[data-testid="prompt-kit-status-title"]')?.textContent ?? "";
}

function statusText(view: HTMLDivElement): string {
  return view.querySelector('[data-testid="prompt-kit-status"]')?.textContent ?? "";
}

function select(view: HTMLDivElement, label: string): HTMLSelectElement {
  const found = view.querySelector<HTMLSelectElement>(`select[data-label="${label}"]`);
  if (!found) throw new Error(`no select labelled "${label}"`);
  return found;
}

async function choose(view: HTMLDivElement, label: string, value: string) {
  const control = select(view, label);
  await act(async () => {
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function type(view: HTMLDivElement, label: string, value: string) {
  const input = view.querySelector<HTMLInputElement>(`input[data-label="${label}"]`);
  if (!input) throw new Error(`no input labelled "${label}"`);
  // React tracks the last value it set; the native setter bypasses that tracker
  // so the bubbling input event is seen as a real change.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(view: HTMLDivElement, testId: string) {
  const button = view.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!button) throw new Error(`no button ${testId}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function pressAction(view: HTMLDivElement, label: string) {
  const button = view.querySelector<HTMLButtonElement>(`button[data-label="${label}"]`);
  if (!button) throw new Error(`no action ${label}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  holder.save.mockReset();
  holder.listProviders.mockReset();
  holder.listActions.mockReset();
  holder.testEndpoint.mockReset();
  holder.keyStatus.mockReset();
  holder.keyStatus.mockResolvedValue({ status: "ok", stored: false });
  holder.writeKey.mockReset();
});

describe("status bar", () => {
  it("reports the default path as ready with no controls until something changes", async () => {
    holder.state = readyState({});
    const view = await render();
    expect(statusTitle(view)).toBe("Ready · Provider CLI · current agent model");
    expect(view.querySelector('[data-testid="prompt-kit-save"]')).toBeNull();
  });

  it("names the reason a rewrite would be refused", async () => {
    holder.state = readyState({ modelMode: "dedicated", dedicatedProvider: "openai" });
    const view = await render();
    expect(statusTitle(view)).toContain("Not ready");
    expect(statusText(view)).toContain("Select a dedicated provider and model.");
  });

  it("reports a selection the catalog no longer lists", async () => {
    holder.state = readyState({
      modelMode: "dedicated",
      dedicatedProvider: "ghost",
      dedicatedModel: "gone",
    });
    const view = await render();
    expect(statusText(view)).toContain("Provider is unavailable: ghost");
    // The row that needs fixing carries the same message.
    expect(select(view, "Provider").parentElement?.textContent).toContain("Provider is unavailable: ghost");
  });

  it("explains that a disabled-everything document hides the pill", async () => {
    holder.state = readyState({ actionEnabled: { coding: false } });
    const view = await render();
    expect(statusText(view)).toContain("no PromptKit pill");
  });

  it("refuses the API transport until an endpoint is chosen or a provider is mapped", async () => {
    holder.state = readyState({ transport: "api" });
    const view = await render();
    expect(statusTitle(view)).toContain("Not ready · Direct API");
    expect(statusText(view)).toContain("Add an API endpoint");
  });

  // Model source is a Provider CLI choice; Direct API picks its model under API endpoint.
  it("shows Model source only for Provider CLI and the endpoint's Model for Direct API", async () => {
    holder.state = readyState({ transport: "api", modelMode: "current", apiEndpointId: "gemini", apiEndpoints: [GEMINI] });
    const view = await render();
    expect(view.querySelector('select[data-label="Model source"]')).toBeNull();
    expect(select(view, "Model")).toBeTruthy();

    await choose(view, "Transport", "cli");
    expect(select(view, "Model source")).toBeTruthy();
  });
});

describe("output language", () => {
  it("offers the source language first, then every loaded language, and saves the choice", async () => {
    const { listLanguages } = await import("../../shared/language-registry/registry.js");
    holder.state = readyState({});
    holder.save.mockResolvedValue(true);
    const view = await render();
    const control = select(view, "Output language");
    expect(Array.from(control.options, (option) => option.value)).toEqual([
      "source",
      ...listLanguages().map((language) => language.id),
    ]);
    const first = listLanguages()[0]!;
    await choose(view, "Output language", first.id);
    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({ outputLanguage: first.id });
  });

  it("blocks readiness and marks the row when the saved id is no longer loaded", async () => {
    holder.state = readyState({ outputLanguage: "gone" });
    const view = await render();
    expect(statusText(view)).toContain('No output language is loaded with the id "gone"');
    const control = select(view, "Output language");
    expect(control.value).toBe("gone");
    expect(control.parentElement?.querySelector("[data-error]")).not.toBeNull();
  });
});

describe("draft, save and discard", () => {
  it("saves the edited document against the revision it was drafted from", async () => {
    holder.state = readyState({});
    holder.save.mockResolvedValue(true);
    const view = await render();

    await choose(view, "Model source", "dedicated");
    expect(statusText(view)).toContain("Unsaved changes");
    await choose(view, "Provider", "openai");
    await choose(view, "Model", "gpt-5");
    expect(statusTitle(view)).toBe("Ready · Provider CLI · openai · gpt-5");

    await press(view, "prompt-kit-save");
    expect(holder.save).toHaveBeenCalledTimes(1);
    const [savedValues, savedRevision] = holder.save.mock.calls[0]!;
    expect(savedValues).toMatchObject({
      modelMode: "dedicated",
      dedicatedProvider: "openai",
      dedicatedModel: "gpt-5",
    });
    expect(savedRevision).toBe("r1");
    expect(statusText(view)).toContain("Saved.");
  });

  it("discards the draft and shows the host document again", async () => {
    holder.state = readyState({});
    const view = await render();
    await choose(view, "Transport", "api");
    expect(select(view, "Transport").value).toBe("api");
    await press(view, "prompt-kit-discard");
    expect(select(view, "Transport").value).toBe("cli");
    expect(view.querySelector('[data-testid="prompt-kit-save"]')).toBeNull();
  });

  it("blocks Save on a timeout outside the schema range and says which bound was crossed", async () => {
    holder.state = readyState({});
    const view = await render();
    await press(view, "prompt-kit-advanced-toggle");
    await type(view, "Timeout (ms)", String(TIMEOUT_MS.max + 1));
    expect(statusTitle(view)).toBe("Cannot save yet");
    expect(statusText(view)).toContain(TIMEOUT_MS.max.toLocaleString());
    const save = view.querySelector<HTMLButtonElement>('[data-testid="prompt-kit-save"]');
    expect(save?.disabled).toBe(true);
    await press(view, "prompt-kit-save");
    expect(holder.save).not.toHaveBeenCalled();
  });

  it("notes the host's own cap when the timeout is legal but unreachable", async () => {
    holder.state = readyState({ timeoutMs: TIMEOUT_MS.hostRpcCapMs + 1 });
    const view = await render();
    await press(view, "prompt-kit-advanced-toggle");
    const row = view.querySelector('[data-row="Timeout (ms)"]');
    expect(row?.textContent).toContain(`${TIMEOUT_MS.hostRpcCapMs / 1000} s`);
    expect(row?.querySelector("[data-error]")).toBeNull();
  });
});

describe("API endpoint section", () => {
  it("adds a preset by choosing it and asks for its model", async () => {
    holder.state = readyState({ transport: "api" });
    holder.save.mockResolvedValue(true);
    const view = await render();
    expect(statusText(view)).toContain("Add an API endpoint");

    await choose(view, "Endpoint", "gemini");
    expect(view.querySelector<HTMLInputElement>('input[data-label="Base URL"]')?.value).toBe(
      "https://generativelanguage.googleapis.com",
    );
    expect(statusText(view)).toContain("Select an API model.");

    await type(view, "Model", "gemini-2.5-flash-lite");
    expect(statusTitle(view)).toBe("Ready · Direct API · gemini · gemini-2.5-flash-lite");

    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({
      apiEndpointId: "gemini",
      apiModel: "gemini-2.5-flash-lite",
      apiEndpoints: [expect.objectContaining({ id: "gemini", apiKeyEnv: "GEMINI_API_KEY" })],
    });
  });

  it("writes the model list a successful test returns into the draft", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpointId: "gemini",
      apiEndpoints: [{ ...GEMINI, models: [] }],
    });
    holder.testEndpoint.mockResolvedValue({ status: "ok", models: ["a-model", "b-model"] });
    const view = await render();

    await pressAction(view, "Connection");
    expect(holder.testEndpoint).toHaveBeenCalledWith({
      endpoint: expect.objectContaining({ id: "gemini" }),
      secretsDir: null,
    });
    const model = select(view, "Model");
    expect(Array.from(model.options, (option) => option.value)).toEqual(["", "a-model", "b-model"]);
    expect(view.querySelector('[data-row="Connection"]')?.textContent).toContain("2 models");
  });

  it("keeps a field typed during a test instead of overwriting it with the test result", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpointId: "gemini",
      apiEndpoints: [{ ...GEMINI, models: [] }],
    });
    let finish: (value: unknown) => void = () => {};
    holder.testEndpoint.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    holder.save.mockResolvedValue(true);
    const view = await render();

    await pressAction(view, "Connection");
    await type(view, "Key variable", "MY_GEMINI_KEY");
    await act(async () => {
      finish({ status: "ok", models: ["a-model"] });
    });
    await flush();

    await choose(view, "Model", "a-model");
    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({
      apiEndpoints: [expect.objectContaining({ apiKeyEnv: "MY_GEMINI_KEY", models: ["a-model"] })],
    });
  });

  it("blocks Save while a custom endpoint has no usable base URL", async () => {
    holder.state = readyState({ transport: "api" });
    const view = await render();
    await choose(view, "Endpoint", "__custom__");
    expect(statusTitle(view)).toBe("Cannot save yet");
    expect(statusText(view)).toContain("base URL");
    await type(view, "Base URL", "http://127.0.0.1:8080/v1");
    expect(statusText(view)).toContain("key variable");
    await choose(view, "Key source", "none");
    expect(statusTitle(view)).not.toBe("Cannot save yet");
  });

  // The key goes to the daemon through its own RPC and never into the settings document.
  it("stores a typed key write-only and keeps it out of the saved settings", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpointId: "gemini",
      apiEndpoints: [{ ...GEMINI, keySource: "secrets_file" }],
    });
    holder.writeKey.mockResolvedValue({ status: "ok" });
    holder.save.mockResolvedValue(true);
    const view = await render();
    expect(view.querySelector('[data-row="API key"]')?.textContent).toContain("Prefer an environment variable");

    await type(view, "API key", "AIza-secret");
    holder.keyStatus.mockResolvedValue({ status: "ok", stored: true });
    await pressAction(view, "Store API key");
    expect(holder.writeKey).toHaveBeenCalledWith({ secretsDir: null, name: "GEMINI_API_KEY", value: "AIza-secret" });
    expect(view.querySelector<HTMLInputElement>('input[data-label="API key"]')?.value).toBe("");
    expect(view.querySelector('[data-row="Remove stored API key"]')).not.toBeNull();

    await pressAction(view, "Remove stored API key");
    expect(holder.writeKey).toHaveBeenLastCalledWith({ secretsDir: null, name: "GEMINI_API_KEY", value: null });

    await choose(view, "Key source", "env");
    await press(view, "prompt-kit-save");
    expect(JSON.stringify(holder.save.mock.calls[0]?.[0])).not.toContain("AIza-secret");
  });

  // The host dropdown cannot search, so a filter row above it shortens its options.
  it("filters the Model dropdown from the row above it and keeps the saved model", async () => {
    const models = Array.from({ length: 12 }, (_, index) => `model-${index}`).concat(["gemini-3.1-pro-preview"]);
    holder.state = readyState({
      transport: "api",
      apiEndpointId: "gemini",
      apiModel: "model-3",
      apiEndpoints: [{ ...GEMINI, models }],
    });
    const view = await render();
    await type(view, "Filter models", "PRO");
    expect(Array.from(select(view, "Model").options, (option) => option.value)).toEqual(["", "model-3", "gemini-3.1-pro-preview"]);
    expect(view.querySelector('[data-row="Filter models"]')?.textContent).toContain("1 of 13 models match.");
  });

  it("shows no filter row for a short model list", async () => {
    holder.state = readyState({ transport: "api", apiEndpointId: "gemini", apiEndpoints: [GEMINI] });
    const view = await render();
    expect(view.querySelector('input[data-label="Filter models"]')).toBeNull();
  });

  it("lists endpoints A–Z, saved custom ones with their protocol, and Custom endpoint… last", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpoints: [{ ...GEMINI, id: "groq", label: "Groq", protocol: "openai", models: [] }],
    });
    const view = await render();
    const labels = Array.from(select(view, "Endpoint").options, (option) => option.textContent ?? "");
    expect(labels[0]).toBe("Choose an endpoint…");
    expect(labels.at(-1)).toBe("Custom endpoint…");
    const middle = labels.slice(1, -1);
    expect(middle).toEqual([...middle].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
    expect(middle).toContain("Groq — OpenAI-compatible");
  });

  it("asks Cloudflare for an account ID variable above the key variable, prefilled", async () => {
    holder.state = readyState({ transport: "api" });
    const view = await render();
    await choose(view, "Endpoint", "cloudflare");
    const account = view.querySelector<HTMLInputElement>('input[data-label="Account ID"]');
    expect(account?.value).toBe("CLAUDFLARE_ACCOUNT_ID");
    const rows = Array.from(view.querySelectorAll("[data-row]"), (row) => row.getAttribute("data-row"));
    expect(rows.indexOf("Account ID")).toBeLessThan(rows.indexOf("Key variable"));
  });

  // One key source per endpoint; the secrets directory lives with it, not under Advanced.
  it("shows the rows of the chosen key source and saves the choice", async () => {
    holder.state = readyState({ transport: "api", apiEndpointId: "gemini", apiEndpoints: [GEMINI] });
    holder.save.mockResolvedValue(true);
    const view = await render();
    expect(view.querySelector('input[data-label="Key variable"]')).not.toBeNull();
    expect(view.querySelector('input[data-label="Secrets directory"]')).toBeNull();

    await choose(view, "Key source", "secrets_file");
    expect(view.querySelector('input[data-label="Secrets directory"]')).not.toBeNull();
    await type(view, "Secrets directory", "relative/keys");
    expect(statusText(view)).toContain("absolute path");
    await type(view, "Secrets directory", "~/keys");

    await choose(view, "Key source", "none");
    expect(view.querySelector('input[data-label="Key variable"]')).toBeNull();
    await choose(view, "Key source", "secrets_file");
    await press(view, "prompt-kit-advanced-toggle");
    expect(view.querySelectorAll('input[data-label="Secrets directory"]').length).toBe(1);

    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({
      secretsDir: "~/keys",
      apiEndpoints: [expect.objectContaining({ id: "gemini", keySource: "secrets_file" })],
    });
  });

  it("drops a provider mapping that pointed at a removed endpoint", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpointId: "gemini",
      apiModel: "gemini-2.5-flash-lite",
      apiEndpoints: [GEMINI],
      apiEndpointByProvider: { openai: "gemini" },
    });
    holder.save.mockResolvedValue(true);
    const view = await render();
    expect(statusTitle(view)).toContain("Ready");
    await pressAction(view, "Remove endpoint");
    expect(statusTitle(view)).not.toBe("Cannot save yet");
    // Nothing is left to send an API rewrite through, and the bar says so.
    expect(statusText(view)).toContain("Add an API endpoint");
  });
});

describe("advanced overrides", () => {
  const providers = {
    providers: [
      { provider: "pi-peer", label: "Pi peer", available: true, models: [] },
      { provider: "mystery", label: "Mystery", available: true, models: [] },
    ],
  };

  it("lists only mapped providers and adds one through the Add row", async () => {
    holder.state = readyState({});
    holder.save.mockResolvedValue(true);
    holder.listActions.mockResolvedValue(actionCatalog);
    holder.listProviders.mockResolvedValue(providers);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PromptKitSettingsScreen {...surfaceProps} />);
    });
    await flush();
    const view = container;

    await press(view, "prompt-kit-advanced-toggle");
    // The catalog has two providers; neither gets a row until it is mapped.
    expect(view.querySelector('select[data-label="Pi peer"]')).toBeNull();
    expect(view.querySelector('select[data-label="Mystery"]')).toBeNull();

    await choose(view, "No provider is mapped", "mystery");
    const mystery = select(view, "Mystery");
    expect(mystery.value).toBe("pi");
    await choose(view, "Mystery", "opencode");
    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({ providerCli: { mystery: "opencode" } });
  });

  it("removes a mapping from its own row", async () => {
    holder.state = readyState({
      transport: "api",
      apiEndpoints: [GEMINI],
      apiEndpointByProvider: { "pi-peer": "gemini" },
    });
    holder.save.mockResolvedValue(true);
    holder.listActions.mockResolvedValue(actionCatalog);
    holder.listProviders.mockResolvedValue(providers);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<PromptKitSettingsScreen {...surfaceProps} />);
    });
    await flush();
    const view = container;

    await press(view, "prompt-kit-advanced-toggle");
    expect(select(view, "Pi peer").value).toBe("gemini");
    expect(view.querySelector('select[data-label="Mystery"]')).toBeNull();
    await choose(view, "Pi peer", "__remove__");
    expect(view.querySelector('select[data-label="Pi peer"]')).toBeNull();
    await press(view, "prompt-kit-save");
    expect(holder.save.mock.calls[0]?.[0]).toMatchObject({ apiEndpointByProvider: {} });
  });
});
