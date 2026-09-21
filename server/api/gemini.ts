import { at, authHeaders, joinUrl, stringFieldAt, type ApiCall, type ApiHttpRequest, type ApiModelsCall, type ApiProtocol } from "./protocol.js";

/**
 * The Google Gemini `generateContent` protocol.
 *
 * Gemini is the one protocol that differs structurally rather than cosmetically:
 * the model is a path segment, not a body field; the instruction goes in
 * `systemInstruction`; roles are `user`/`model`; and the answer arrives as
 * `candidates[0].content.parts[].text`. It also has no `temperature: 0` default
 * equivalent worth sending, so temperature is set explicitly for the same
 * transformation-not-creation reason as the other two.
 *
 * A base URL of `https://generativelanguage.googleapis.com` yields
 * `/v1beta/models/<model>:generateContent`, the documented stable path.
 */
export const geminiProtocol: ApiProtocol = {
  id: "gemini",
  buildRequest(call: ApiCall): ApiHttpRequest {
    const model = encodeURIComponent(call.model);
    return {
      url: joinUrl(call.baseUrl, `/v1beta/models/${model}:generateContent`),
      headers: {
        "content-type": "application/json",
        ...authHeaders(call.apiKey, (key) => ({ "x-goog-api-key": key })),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: call.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: call.taskPrompt }] }],
        generationConfig: { temperature: 0 },
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const parts = at(payload, "candidates", 0, "content", "parts");
    if (!Array.isArray(parts)) return null;
    const text: string[] = [];
    for (const part of parts) {
      if (part === null || typeof part !== "object") continue;
      const value = (part as { text?: unknown }).text;
      if (typeof value === "string") text.push(value);
    }
    return text.length === 0 ? null : text.join("");
  },
  buildModelsRequest(call: ApiModelsCall): ApiHttpRequest {
    // Google's model list is large, so only the fields the picker needs are asked
    // for; the page size keeps a long catalogue from being pulled in one call.
    return {
      url: joinUrl(call.baseUrl, "/v1beta/models?pageSize=200"),
      headers: {
        ...authHeaders(call.apiKey, (key) => ({ "x-goog-api-key": key })),
      },
      body: "",
    };
  },
  parseModelsResponse(payload: unknown): string[] {
    // `models/gemini-2.5-flash` is the wire name; the path segment is the id a
    // request takes, so the prefix is stripped here rather than by every caller.
    return stringFieldAt(payload, ["models"], "name").map((name) =>
      name.startsWith("models/") ? name.slice("models/".length) : name,
    );
  },
};
