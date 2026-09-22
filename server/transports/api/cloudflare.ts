import { at, authHeaders, joinUrl, stringFieldAt, type ApiCall, type ApiHttpRequest, type ApiModelsCall, type ApiProtocol } from "./protocol.js";

/**
 * Cloudflare Workers AI `ai/run`. Base URL `https://api.cloudflare.com/client/v4`; the account
 * id and the model are path segments (`/accounts/<id>/ai/run/@cf/...`, model slashes kept),
 * and the answer is `result.response`.
 * `max_tokens` is sent because the service default (256) would cut a rewrite short.
 */
const MAX_TOKENS = 2048;

function accountPath(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}/ai`;
}

function bearer(key: string): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

export const cloudflareProtocol: ApiProtocol = {
  id: "cloudflare",
  buildRequest(call: ApiCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, `${accountPath(call.accountId)}/run/${encodeURI(call.model.replace(/^\/+/, ""))}`),
      headers: { "content-type": "application/json", ...authHeaders(call.apiKey, bearer) },
      body: JSON.stringify({
        messages: [
          { role: "system", content: call.systemPrompt },
          { role: "user", content: call.taskPrompt },
        ],
        temperature: 0,
        max_tokens: MAX_TOKENS,
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const response = at(payload, "result", "response");
    if (typeof response === "string") return response;
    // Some newer models answer in the OpenAI shape inside `result`.
    const content = at(payload, "result", "choices", 0, "message", "content");
    return typeof content === "string" ? content : null;
  },
  buildModelsRequest(call: ApiModelsCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, `${accountPath(call.accountId)}/models/search?task=Text%20Generation&per_page=100`),
      headers: { ...authHeaders(call.apiKey, bearer) },
      body: "",
    };
  },
  parseModelsResponse(payload: unknown): string[] {
    return stringFieldAt(payload, ["result"], "name");
  },
};
