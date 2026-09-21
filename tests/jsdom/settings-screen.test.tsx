import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { promptKitSettingsSchema } from "../../shared/settings.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-native", async () => (await import("./mocks.js")).reactNativeMock);
vi.mock(
  "@getpaseo/plugin/client/ui",
  async () => (await import("./mocks.js")).pluginUiMock,
);

const holder = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
  save: vi.fn(),
  listProviders: vi.fn(),
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => holder.state,
  useRpc: () => holder.listProviders,
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
    {
      provider: "ghost",
      label: "Ghost",
      available: false,
      models: [],
    },
  ],
};

const defaults = promptKitSettingsSchema.parse({});

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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<PromptKitSettingsScreen {...surfaceProps} />);
  });
  return container;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function selectValue(container: HTMLDivElement, label: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(`select[data-label="${label}"]`)!;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function pressSave(container: HTMLDivElement) {
  const button = container.querySelector<HTMLButtonElement>(
    'button[data-label="Save settings"]',
  )!;
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
});

describe("promptkit settings screen", () => {
  it("saves the edited selection through the host settings API and keeps it after the host echoes it back", async () => {
    holder.state = readyState({});
    holder.save.mockResolvedValue(true);
    holder.listProviders.mockResolvedValue(catalog);
    const view = await render();
    const mode = view.querySelector<HTMLSelectElement>('select[data-label="Rewrite model"]')!;
    expect(mode.value).toBe("current");

    await selectValue(view, "Rewrite model", "dedicated");
    await pressSave(view);

    expect(holder.save).toHaveBeenCalledTimes(1);
    const [savedValues, savedRevision] = holder.save.mock.calls[0]!;
    expect(savedValues).toMatchObject({ modelMode: "dedicated" });
    expect(savedRevision).toBe("r1");

    holder.state = readyState({ modelMode: "dedicated" });
    await act(async () => {
      root!.render(<PromptKitSettingsScreen {...surfaceProps} />);
    });
    expect(
      view.querySelector<HTMLSelectElement>('select[data-label="Rewrite model"]')!.value,
    ).toBe("dedicated");
  });

  it("loads the provider catalog and offers models and thinking options for a dedicated selection", async () => {
    holder.state = readyState({
      modelMode: "dedicated",
      dedicatedProvider: "openai",
      dedicatedModel: "gpt-5",
    });
    holder.listProviders.mockResolvedValue(catalog);
    const view = await render();
    await flush();

    expect(holder.listProviders).toHaveBeenCalled();
    const provider = view.querySelector<HTMLSelectElement>('select[data-label="Provider"]')!;
    const model = view.querySelector<HTMLSelectElement>('select[data-label="Model"]')!;
    const thinking = view.querySelector<HTMLSelectElement>('select[data-label="Thinking"]')!;
    expect(provider.value).toBe("openai");
    expect(model.value).toBe("gpt-5");
    const optionValues = (select: HTMLSelectElement) =>
      Array.from(select.options, (option) => option.value);
    expect(optionValues(model)).toEqual(["", "gpt-5"]);
    expect(optionValues(thinking)).toEqual(["", "high"]);
    expect(provider.options[1]!.textContent).toBe("OpenAI");
    expect(provider.options[2]!.textContent).toBe("Ghost (unavailable)");
  });

  it("shows an incomplete dedicated selection as invalid", async () => {
    holder.state = readyState({
      modelMode: "dedicated",
      dedicatedProvider: "openai",
      dedicatedModel: null,
    });
    holder.listProviders.mockResolvedValue(catalog);
    const view = await render();
    await flush();

    const error = view.querySelector("[data-error]");
    expect(error?.textContent).toBe("Select a dedicated provider and model.");
  });

  it("shows a selection that is no longer listed as invalid", async () => {
    holder.state = readyState({
      modelMode: "dedicated",
      dedicatedProvider: "ghost",
      dedicatedModel: "gone",
    });
    holder.listProviders.mockResolvedValue(catalog);
    const view = await render();
    await flush();

    expect(view.querySelector("[data-error]")?.textContent).toBe("Provider is unavailable: ghost");
  });

  it("shows no error while the current model is selected", async () => {
    holder.state = readyState({});
    const view = await render();
    await flush();
    expect(view.querySelector("[data-error]")).toBeNull();
    expect(holder.listProviders).not.toHaveBeenCalled();
  });
});
