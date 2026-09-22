# Template — `server/transports/api/<protocol>.ts`

A protocol module owns exactly three things: building the request, reading the answer, listing
models. Everything else (key, timeout, error codes, validator) belongs to `runner.ts` and must
not be repeated here.

```ts
import {
  at,
  authHeaders,
  joinUrl,
  stringFieldAt,
  type ApiCall,
  type ApiHttpRequest,
  type ApiModelsCall,
  type ApiProtocol,
} from "./protocol.js";

/**
 * <Vendor name> <API name>.
 *
 * State here what makes this protocol DIFFERENT from the three existing ones: the auth
 * header, where the system prompt goes, the answer's shape. If nothing differs from the
 * OpenAI shape, you don't need this module — just a preset (docs/EXTENDING.md §5).
 */
export const myProtocol: ApiProtocol = {
  id: "my-protocol", // add to API_PROTOCOL_IDS (shared/api-protocol.ts)
  buildRequest(call: ApiCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/v1/complete"),
      headers: {
        "content-type": "application/json",
        // Empty key = local server: authHeaders drops the header instead of sending "Bearer ".
        ...authHeaders(call.apiKey, (key) => ({ authorization: `Bearer ${key}` })),
      },
      body: JSON.stringify({
        model: call.model,
        system: call.systemPrompt,
        input: call.taskPrompt,
        temperature: 0, // rewrite is transformation, not composition
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const text = at(payload, "output", 0, "text");
    return typeof text === "string" ? text : null; // null ⇒ the runner reports api_bad_response
  },
  buildModelsRequest(call: ApiModelsCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/v1/models"),
      headers: { ...authHeaders(call.apiKey, (key) => ({ authorization: `Bearer ${key}` })) },
      body: "",
    };
  },
  parseModelsResponse(payload: unknown): string[] {
    return stringFieldAt(payload, ["data"], "id");
  },
};
```

Register it: `PROTOCOLS` in `server/transports/api/runner.ts`, `PROTOCOL_OPTIONS` in
`client/settings/api-endpoints.ts`. Test following the pattern in
`tests/unit/api-protocols.test.ts`.
</content>
