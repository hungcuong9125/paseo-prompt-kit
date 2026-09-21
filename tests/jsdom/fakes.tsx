import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createElement } from "react";

export interface FakeAgent {
  id: string;
  workspaceId: string;
  archivedAt?: string | null;
}

export interface FakePill {
  id: string;
  workspaceId: string;
  agentId: string;
  button: Record<string, unknown>;
  removed: boolean;
}

export interface FakeAgentUpdate {
  kind: "upsert" | "remove";
  agent?: FakeAgent;
  agentId?: string;
}

export interface FakeClient {
  client: PluginClientContext;
  pills: FakePill[];
  screens: { id: string; title: string; Component: unknown }[];
  rpcCalls: { method: string; input: unknown }[];
  sent: number;
  live(): FakePill[];
  upsert(agent: FakeAgent): void;
  removeAgent(agentId: string): void;
  cleanup(): void;
}

/**
 * Stands in for the host's client runtime: it enforces the same duplicate-pill
 * rule as `PluginButtonStore` and refuses every send/run path, so a rewrite that
 * tried to auto-send would fail here instead of passing silently.
 */
export function createFakeClient(
  options: {
    agents?: readonly FakeAgent[];
    rpc?: (method: string, input: unknown) => Promise<unknown>;
    listError?: unknown;
  } = {},
): FakeClient {
  const pills: FakePill[] = [];
  const screens: { id: string; title: string; Component: unknown }[] = [];
  const rpcCalls: { method: string; input: unknown }[] = [];
  const handlers = new Set<(update: FakeAgentUpdate) => void>();
  const state = { sent: 0 };

  const listEntries = (options.agents ?? []).map((agent) => ({
    agent: { ...agent, archivedAt: agent.archivedAt ?? null },
    project: {},
  }));

  function refuse(): never {
    state.sent += 1;
    throw new Error("PromptKit must never send or run a turn");
  }

  const client = {
    addComposerPill(contribution: {
      id: string;
      workspaceId: string;
      agentId: string;
      button: Record<string, unknown>;
    }) {
      const duplicate = pills.some(
        (pill) =>
          !pill.removed &&
          pill.id === contribution.id &&
          pill.workspaceId === contribution.workspaceId &&
          pill.agentId === contribution.agentId,
      );
      if (duplicate) throw new Error(`Duplicate plugin button: ${contribution.id}`);
      const record: FakePill = {
        id: contribution.id,
        workspaceId: contribution.workspaceId,
        agentId: contribution.agentId,
        button: contribution.button,
        removed: false,
      };
      pills.push(record);
      return {
        update(patch: Partial<Record<string, unknown>>) {
          record.button = { ...record.button, ...patch };
        },
        remove() {
          record.removed = true;
        },
      };
    },
    addSettingsScreen(contribution: { id: string; title: string; Component: unknown }) {
      screens.push(contribution);
      return () => {};
    },
    rpc: async (contract: { name: string }, input: unknown) => {
      rpcCalls.push({ method: contract.name, input });
      if (!options.rpc) throw new Error(`No fake rpc handler for ${contract.name}`);
      return options.rpc(contract.name, input);
    },
    paseo: {
      agents: {
        subscribe(handler: (update: FakeAgentUpdate) => void) {
          handlers.add(handler);
          return () => handlers.delete(handler);
        },
        list: async () => {
          if (options.listError) throw options.listError;
          return { entries: listEntries, pageInfo: { hasMore: false } };
        },
        ref: refuse,
        create: refuse,
      },
    },
  };

  return {
    client: client as unknown as PluginClientContext,
    pills,
    screens,
    rpcCalls,
    get sent() {
      return state.sent;
    },
    live: () => pills.filter((pill) => !pill.removed),
    upsert: (agent) => {
      for (const handler of handlers) handler({ kind: "upsert", agent });
    },
    removeAgent: (agentId) => {
      for (const handler of handlers) handler({ kind: "remove", agentId });
    },
    cleanup: () => {
      for (const handler of [...handlers]) handler({ kind: "remove", agentId: "__cleanup__" });
    },
  };
}

/** Mounts the real Composer DOM shape the web adapter locates. */
export function mountComposer(value = ""): HTMLTextAreaElement {
  const root = document.createElement("div");
  root.setAttribute("data-testid", "message-input-root");
  const field = document.createElement("textarea");
  field.setAttribute("data-composer-input", "");
  field.value = value;
  root.appendChild(field);
  document.body.appendChild(root);
  return field;
}

export function unmountComposer(): void {
  document.body.replaceChildren();
}

export const stubIcon = () => createElement("span");
