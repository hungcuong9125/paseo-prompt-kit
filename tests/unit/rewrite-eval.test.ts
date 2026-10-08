import { describe, expect, it } from "vitest";
import { EVAL_CASES, SAMPLE_PACKS } from "../eval/cases.js";
import { failures, rewriteLive } from "../eval/run-case.js";
import { resolveAction } from "../../shared/action-registry/registry.js";
import { REWRITE_CONTRACT } from "../../shared/action-registry/rewrite-contract.js";

/** The eval must be able to pass and to fail before a live model is trusted to be graded by it. */
describe("rewrite eval cases", () => {
  it("covers every offered sample with a behavioural case", () => {
    const covered = new Set(EVAL_CASES.map((entry) => entry.actionId));
    for (const pack of SAMPLE_PACKS) expect(covered.has(pack.id), pack.id).toBe(true);
  });

  it("have distinct ids and name an action that resolves", () => {
    expect(new Set(EVAL_CASES.map((entry) => entry.id)).size).toBe(EVAL_CASES.length);
    for (const entry of EVAL_CASES) {
      expect(resolveAction(entry.actionId, SAMPLE_PACKS), entry.id).not.toBeNull();
    }
  });

  for (const entry of EVAL_CASES) {
    // Fails if a check cannot be satisfied by any faithful rewrite.
    it(`${entry.id}: a faithful rewrite passes every check`, () => {
      expect(failures(entry, entry.pass)).toEqual([]);
    });

    // Fails if a check would let a rewrite that breaks the rule through.
    it(`${entry.id}: an unfaithful rewrite is caught`, () => {
      expect(failures(entry, entry.fail).length).toBeGreaterThan(0);
    });
  }
});

describe("live eval runner", () => {
  // Fails if the runner stops sending the case's action and draft through the real engine and endpoint.
  it.each(SAMPLE_PACKS)("posts Core and $id rules with the draft, then returns the model text", async (pack) => {
    const entry = EVAL_CASES.find((candidate) => candidate.actionId === pack.id)!;
    let body = "";
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: entry.pass }, finish_reason: "stop" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const result = await rewriteLive(
      entry,
      { protocol: "openai", baseUrl: "https://api.example.com/v1", keyEnv: "EVAL_KEY", model: "m" },
      { fetch, env: { EVAL_KEY: "k" } },
    );

    expect(result).toEqual({ ok: true, text: entry.pass });
    expect(body).toContain(entry.draft);
    const action = resolveAction(entry.actionId, SAMPLE_PACKS)!;
    const payload = JSON.parse(body) as { messages: { role: string; content: string }[] };
    expect(payload.messages.find((message) => message.role === "system")?.content).toBe(`${REWRITE_CONTRACT}\n\n${action.systemPrompt}`);
    const task = payload.messages.find((message) => message.role === "user")?.content;
    expect(task).toContain(action.taskInstruction);
    expect(task).toContain(`<draft>\n${entry.draft}\n</draft>`);
  });

  // Fails if a case's output language stops reaching the <task> block the model sees.
  it("sends the case's output language inside the task", async () => {
    const entry = EVAL_CASES.find((candidate) => candidate.outputLanguage === "vi")!;
    let body = "";
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: entry.pass }, finish_reason: "stop" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    await rewriteLive(
      entry,
      { protocol: "openai", baseUrl: "https://api.example.com/v1", keyEnv: "EVAL_KEY", model: "m" },
      { fetch, env: { EVAL_KEY: "k" } },
    );

    expect(body).toContain("Output language: Write the message in Vietnamese");
  });
});
