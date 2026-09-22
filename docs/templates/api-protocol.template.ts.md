# Template — `server/transports/api/<protocol>.ts`

Một module protocol sở hữu đúng ba việc: dựng request, đọc answer, liệt kê model.
Mọi thứ khác (key, timeout, mã lỗi, validator) là của `runner.ts` và không lặp lại ở đây.

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
 * <Tên vendor> <tên API>.
 *
 * Ghi ở đây điều khiến protocol này KHÁC ba protocol có sẵn: header xác thực,
 * chỗ đặt system prompt, hình dạng answer. Nếu không có gì khác OpenAI shape,
 * bạn không cần module này — chỉ cần một preset (docs/EXTENDING.md §5).
 */
export const myProtocol: ApiProtocol = {
  id: "my-protocol", // thêm vào API_PROTOCOL_IDS (shared/api-protocol.ts)
  buildRequest(call: ApiCall): ApiHttpRequest {
    return {
      url: joinUrl(call.baseUrl, "/v1/complete"),
      headers: {
        "content-type": "application/json",
        // Key rỗng = local server: authHeaders bỏ header thay vì gửi "Bearer ".
        ...authHeaders(call.apiKey, (key) => ({ authorization: `Bearer ${key}` })),
      },
      body: JSON.stringify({
        model: call.model,
        system: call.systemPrompt,
        input: call.taskPrompt,
        temperature: 0, // rewrite là biến đổi, không phải sáng tác
      }),
    };
  },
  parseResponse(payload: unknown): string | null {
    const text = at(payload, "output", 0, "text");
    return typeof text === "string" ? text : null; // null ⇒ runner báo api_bad_response
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

Đăng ký: `PROTOCOLS` trong `server/transports/api/runner.ts`, `PROTOCOL_OPTIONS` trong
`client/settings/api-endpoints.ts`. Test theo mẫu `tests/unit/api-protocols.test.ts`.
