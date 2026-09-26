import { at, authHeaders, joinUrl, outputTokenCap, stringFieldAt, type ApiCall, type ApiHttpRequest, type ApiModelsCall, type ApiProtocol } from "./protocol.js";

/**
 * The OpenAI Chat Completions protocol.
 *
 * One entry covers far more than OpenAI: OpenRouter, LiteLLM, vLLM,
 * llama.cpp, LM Studio, Together, Fireworks and most internal gateways all speak
 * this shape, so each of them is a `baseUrl` in settings rather than a module.
 *
 * `max_completion_tokens` is sized from the draft. Without it Groq reserves an
 * output estimate that can exceed a free tier's per-minute output limit (HTTP 429).
 */
export const openAiProtocol: ApiProtocol = {
  id: "openai",
  buildRequest(call: ApiCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/chat/completions"),
      headers: {
        "content-type": "application/json",
        ...authHeaders(call.apiKey, (key) => ({ authorization: `Bearer ${key}` })),
      },
      body: JSON.stringify({
        model: call.model,
        messages: [
          { role: "system", content: call.systemPrompt },
          { role: "user", content: call.taskPrompt },
        ],
        // A rewrite is a transformation, not a creative task.
        temperature: 0,
        max_completion_tokens: outputTokenCap(call.draft),
        stream: false,
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const content = at(payload, "choices", 0, "message", "content");
    return typeof content === "string" ? content : null;
  },
  isTruncated(payload: unknown): boolean {
    return at(payload, "choices", 0, "finish_reason") === "length";
  },
  buildModelsRequest(call: ApiModelsCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/models"),
      headers: {
        ...authHeaders(call.apiKey, (key) => ({ authorization: `Bearer ${key}` })),
      },
      body: "",
    };
  },
  parseModelsResponse(payload: unknown): string[] {
    return stringFieldAt(payload, ["data"], "id");
  },
};
