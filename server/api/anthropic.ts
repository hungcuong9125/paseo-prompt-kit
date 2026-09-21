import { at, authHeaders, joinUrl, type ApiCall, type ApiHttpRequest, type ApiProtocol } from "./protocol.js";

/**
 * The Anthropic Messages protocol.
 *
 * Anthropic takes the instruction in a top-level `system` field rather than in
 * the message list, requires `max_tokens`, and authenticates with `x-api-key`
 * plus an explicit version header. It is also the shape z.ai, Alibaba/Qwen and
 * most Anthropic-compatible gateways expose, so those are `baseUrl` entries.
 *
 * `max_tokens` is required here and cannot be omitted, so a rewrite budget is
 * fixed at a value far above any rewritten prompt; the response stops on its own
 * well before it.
 */
const MAX_TOKENS = 4_096;

export const anthropicProtocol: ApiProtocol = {
  id: "anthropic",
  buildRequest(call: ApiCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/v1/messages"),
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        ...authHeaders(call.apiKey, (key) => ({ "x-api-key": key })),
      },
      body: JSON.stringify({
        model: call.model,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: call.systemPrompt,
        messages: [{ role: "user", content: call.taskPrompt }],
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const content = at(payload, "content");
    if (!Array.isArray(content)) return null;
    // A response can interleave thinking blocks; only text blocks are the answer.
    const parts: string[] = [];
    for (const block of content) {
      if (block === null || typeof block !== "object") continue;
      const typed = block as { type?: unknown; text?: unknown };
      if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
    }
    return parts.length === 0 ? null : parts.join("\n");
  },
};
