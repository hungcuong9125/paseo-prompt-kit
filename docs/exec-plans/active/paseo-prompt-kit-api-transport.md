# PromptKit API transport — đường thứ 3 (HTTP trực tiếp)

Packet ID: `paseo-prompt-kit-api-transport` · AIT: chưa mở · Trạng thái: **IMPLEMENTED — chờ commit/push của Human**
Base kiểm chứng: `7f9b939` (tree `9347cd7c…`) · Tree triển khai: `9155cc2606f032cce644f0b92131429ec43f022e` · Người quyết: Human 2026-09-22 · Liên quan: DLF-014 (2 đường hiện có), DLF-015 (quyết định này), DEF-008 (trần RPC 30s)

> **Quyết định của Human đã chốt (4/4 câu hỏi ở bản đề xuất trước):**
> 1. Đường đi = **hai trục** (`modelMode` × `transport`), không phải enum 3 giá trị.
> 2. Secret = **`apiKeyEnv` + `secrets.json`**; **không** cho `apiKey` inline; phải mô tả rõ trong `README.md`.
> 3. Có **`apiEndpointByProvider`** ngay (map provider → endpoint).
> 4. Làm **cả 3 protocol** (`openai`, `anthropic`, `gemini`) trong cùng packet.
> Không cần G0: Human đã trả lời trực tiếp, và packet này không đụng quyết định G0 nào của `core-v0.2.0`.

---

## Outcome And Constraints

**Outcome.** PromptKit có ba đường rewrite độc lập, chọn được từ Settings, cùng chia sẻ một bước kiểm tra đầu ra:

| # | `modelMode` | `transport` | Model lấy từ | Đi qua |
|---|---|---|---|---|
| 1 | `current` | `cli` | `runtimeInfo.model` → `agent.model` | CLI của provider agent |
| 2 | `dedicated` | `cli` | `settings.dedicatedModel` | CLI của provider đó |
| 3 | `dedicated` | `api` | endpoint profile + `settings.apiModel` | **HTTP trực tiếp tới 3 protocol** |

**Ràng buộc chốt cứng.**

- **Một hợp đồng sống duy nhất** (`AGENTS.md`). Hard cut: sửa thẳng `promptKitSettingsSchema` ở `version: 1`, **không** `migrate`, **không** dual-read, **không** nhánh version, **không** shim cho document cũ. Document cũ parse fail → về default. Đây là chủ trương đã ghi, không phải sự cố.
- **Fail fast, fail closed.** Thiếu key, endpoint không resolve được, HTTP lỗi, response sai hình dạng → lỗi có mã, **không** fallback sang CLI, **không** fallback sang endpoint khác, **không** model mặc định.
- **Không đổi ngữ nghĩa rewrite đã accept:** một lượt gọi model; `validateRewriteOutput` chạy `originalPrompt` → output y như đường CLI; không auto-send; chỉ replace Composer; settings host-scoped đi kèm RPC; timeout như cũ.
- **Secret không bao giờ rời khỏi server.** Giá trị key không nằm trong settings document, không trong RPC response, không trong log, không trong error message, không trong artifacts. Settings chỉ giữ **tên biến** (`apiKeyEnv`).
- **`server/cli/**` không đổi.** Đường 3 song song, không thay thế đường 2.
- **Không stream.** Một POST, parse JSON đủ. `stream: true` không cải thiện trần 30s (DEF-008) và làm parser phức tạp thêm.
- **Không gửi trường giới hạn token.** Bản rewrite rất ngắn; bỏ knob này tránh luôn khác biệt `max_tokens` (endpoint cũ) vs `max_completion_tokens` (OpenAI mới, Groq) — xem "Quyết định triển khai" §D3.

**Excluded scope.** npm publish; push/tag (agent không push); mobile; thay đổi đường 1 và 2; gỡ `timeoutMs` khỏi schema (DEF-008 xử lý riêng); OAuth/refresh token (chỉ static key); stream; tool/function calling.

---

## Context And Ownership

**Hiện trạng bị thay** (kiểm chứng tại base `7f9b939`):

| Vị trí | Nội dung |
|---|---|
| `shared/settings.ts:12-15` | `modelMode`, `dedicatedProvider`, `dedicatedModel`, `dedicatedThinkingOptionId` |
| `shared/settings.ts:23` | `providerCli: z.record(z.string(), z.enum(CLI_FAMILY_IDS))` |
| `shared/rpc.ts:12-13` | error codes `unsupported_provider`, `spawn_failed` |
| `server/rewrite.ts:70-101` | `resolveCurrentAgent` |
| `server/rewrite.ts:104-170` | `resolveDedicatedModel` |
| `server/rewrite.ts:184-186` | điểm rẽ `modelMode === "current" ? current : dedicated` |
| `server/rewrite.ts:200-211` | `runCliRewrite` → `validateRewriteOutput` |
| `client/settings/settings-screen.tsx:190-278` | `Rewrite model` + `Provider CLI` |
| `client/pills/rewrite-runner.ts:43-50` | validate selection trước khi gọi RPC |

**Seam phải tôn trọng.** `server/rewrite.ts` là **nơi duy nhất** quyết định đi đường nào. Ba đường chia sẻ: (a) bước resolve model, (b) `validateRewriteOutput`, (c) hình dạng `RewriteOutput`. Transport chỉ được thay đổi **cách lấy text**, không được thay đổi hợp đồng ra ngoài.

**Quyết định đã khoá liên quan:** DLF-014 (hai đường + `runtimeInfo.model` trước) · DLF-013 (probe dùng model rẻ; **budget của probe, không phải allowlist runtime**) · DLF-006 (validator fail-closed, ranh giới injection) · DLF-003 (settings đi kèm RPC, target 0.8.0).
**Hoãn liên quan:** DEF-008 (trần RPC 30s — đường 3 giảm nhẹ nhưng không xoá) · DEF-001, DEF-002 (protected literals).

---

## Quyết định triển khai (Lead tự quyết theo uỷ quyền "tự quyết định phần triển khai")

**D1 — Ba protocol, ba file, một interface.** Mỗi protocol là một module dưới `server/api/`, cùng một interface `ApiProtocol` (dựng request + parse response). Thêm vendor = thêm `baseUrl` vào settings, **không** thêm file. Đây là lý do tách theo protocol chứ không theo vendor.

**D2 — File cấu hình: KHÔNG tạo file cấu hình mới cho endpoint.** Endpoint là **dữ liệu trong settings document của plugin** (`~/.paseo/plugin-settings/prompt-kit/prompt-kit.json`), vì đó là chỗ duy nhất plugin đọc được. Kiểm chứng: `ProviderSnapshotEntry` (`protocol/src/agent-types.ts:116-127`) **không có `env`**, và initialize chỉ mang `settingsDirectory` (`plugin-process-protocol.ts:24`) ⇒ plugin **không** đọc được `~/.paseo/config.json`. Vì vậy profile provider của người dùng trong `config.json` không thể là nguồn cấu hình. Settings screen đã render document này, nên không cần UI mới cho việc lưu.

**D3 — Không gửi `max_tokens`/`max_completion_tokens`.** OpenAI model mới bắt buộc `max_completion_tokens` và từ chối `max_tokens`; endpoint compat cũ chỉ hiểu `max_tokens`. Bỏ hẳn trường này là cách duy nhất đúng cho mọi endpoint mà không cần cờ cấu hình.

**D4 — Secret: hai nguồn, thứ tự cố định, file là `secrets.json` cạnh settings.**

```
1. process.env[<apiKeyEnv>]                    ← daemon fork child nên child thừa hưởng env
2. <secretsFile>/secrets.json  (0600)          ← server-only, không RPC nào trả về
3. không có → lỗi `missing_api_key`, fail closed
```

`secretsFile` mặc định `process.env.PASEO_HOME ?? ~/.paseo` + `/plugin-settings/prompt-kit`, và **override được** bằng settings field `secretsFile`. Lý do cần nguồn 2: Paseo.app khởi động từ Finder **không** có env của shell, nên `GROQ_API_KEY` trong `.zshrc` không tới daemon. Lý do có override: daemon dùng `PASEO_HOME` khác default vẫn dùng được.

Hình dạng `secrets.json` — **tách hẳn khỏi settings**, không bao giờ đi qua RPC:

```json
{ "version": 1, "apiKeys": { "GROQ_API_KEY": "gsk_…", "ANTHROPIC_API_KEY": "sk-ant-…" } }
```

**D5 — Hai trục trong schema, ba lựa chọn trên UI.** `transport: "api"` chỉ hợp lệ khi `modelMode: "dedicated"` **hoặc** khi có `apiEndpointByProvider` khớp provider hiện tại. `current + api` không có mapping → `invalid_selection`. UI render 3 dòng chọn được, nhưng contract chỉ 2 field độc lập.

**D6 — `apiEndpointByProvider` song song `providerCli`.** `providerCli` nói "provider này chạy CLI nào"; `apiEndpointByProvider` nói "provider này gọi endpoint nào". Khi `transport: "api"` và mapping khớp provider của agent, model lấy từ agent (giống đường 1) nhưng đi HTTP. Đây chính là "opencode đấu với OpenAI endpoint riêng".

---

## Cấu trúc cấu hình chốt

```jsonc
{
  "version": 1,
  "values": {
    "modelMode": "dedicated",
    "transport": "api",

    "dedicatedProvider": "claude",
    "dedicatedModel": "claude-haiku-4-5",
    "dedicatedThinkingOptionId": null,
    "providerCli": {},

    "apiEndpointId": "groq",
    "apiModel": "openai/gpt-oss-20b",
    "secretsFile": null,
    "apiEndpoints": [
      { "id": "groq", "label": "Groq", "protocol": "openai",
        "baseUrl": "https://api.groq.com/openai/v1", "apiKeyEnv": "GROQ_API_KEY",
        "models": [{ "id": "openai/gpt-oss-20b", "label": "GPT-OSS 20B" }] },
      { "id": "anthropic", "label": "Anthropic", "protocol": "anthropic",
        "baseUrl": "https://api.anthropic.com", "apiKeyEnv": "ANTHROPIC_API_KEY",
        "models": [{ "id": "claude-haiku-4-5", "label": "Haiku 4.5" }] },
      { "id": "gemini", "label": "Google Gemini", "protocol": "gemini",
        "baseUrl": "https://generativelanguage.googleapis.com", "apiKeyEnv": "GEMINI_API_KEY",
        "models": [{ "id": "gemini-3.7-flash", "label": "Gemini 3.7 Flash" }] }
    ],
    "apiEndpointByProvider": { "opencode": "groq" }
  }
}
```

---

## Work Units

| # | Work unit | Write scope | Song song? |
|---|---|---|---|
| W1.1 | `shared/settings.ts` — thêm `transport`, `apiEndpoints`, `apiEndpointId`, `apiModel`, `apiEndpointByProvider`, `secretsFile`; hard cut v1 | `shared/settings.ts` | serial |
| W1.2 | `shared/api-protocol.ts` (mới) — enum protocol + schema endpoint dùng chung client/server | `shared/**` | serial |
| W1.3 | `shared/rpc.ts` — error codes `missing_api_key`, `api_http_error`, `api_bad_response`, `api_endpoint_unknown` | `shared/rpc.ts` | serial |
| W2.1 | `server/api/key.ts` (mới) — resolve key: env → `secrets.json` → fail closed; không log giá trị | `server/api/**` | ∥ |
| W2.2 | `server/api/openai.ts`, `anthropic.ts`, `gemini.ts` (mới) — 3 protocol, một interface `ApiProtocol` | `server/api/**` | ∥ |
| W2.3 | `server/api/runner.ts` (mới) — `runApiRewrite`: POST, timeout, parse, map lỗi | `server/api/**` | ∥ |
| W2.4 | `server/rewrite.ts` — nhánh `transport`, `resolveApiTarget` | `server/rewrite.ts` | sau W2 |
| W3.1 | `client/settings/settings-screen.tsx` — `Transport`, section `API endpoints`, `API model` | `client/**` | ∥ với W2 |
| W3.2 | `client/pills/rewrite-runner.ts` — validate selection cho nhánh api | `client/**` | ∥ với W2 |
| W4.1 | `README.md` — mục bảo mật API key (bắt buộc theo Human directive) | `README.md` | cuối |
| W4.2 | Test: `tests/unit/api-*.test.ts`, `tests/unit/rewrite.test.ts`, `tests/unit/settings.test.ts` | `tests/**` | cuối |
| W4.3 | Probe live với model rẻ (DLF-013) | `scripts/**` | cuối |

---

## Acceptance And Recovery

**Acceptance checks.**

1. `npm run gate` xanh, log `artifacts/gates/<tree>.log` có `REAL_EXIT:0`.
2. Unit: mỗi protocol dựng đúng request và parse đúng response; thiếu key → `missing_api_key` và **không** có HTTP call; HTTP 401/500 → `api_http_error`; JSON sai hình dạng → `api_bad_response`; endpoint id lạ → `api_endpoint_unknown`.
3. Unit: `transport: "api"` + `modelMode: "current"` **không** có mapping → `invalid_selection`, không gọi mạng.
4. Unit: `apiEndpointByProvider` khớp → dùng model của agent, đi HTTP, không spawn CLI.
5. Unit: đường 1 và 2 **không đổi hành vi** (toàn bộ test hiện có vẫn xanh).
6. Unit: `validateRewriteOutput` chạy trên output của đường 3 y như đường CLI (mất protected literal → `protected_literal_loss`).
7. Live (opt-in `PASEO_LIVE=1`, model rẻ theo DLF-013): một rewrite thật qua mỗi protocol.
8. `README.md` mô tả `apiKeyEnv` + `secrets.json`, quyền file, thứ tự resolve, và điều **không** được làm (không đặt key inline trong settings).

**Recovery.** Rollback = revert commit của packet. Không có migration nên không có trạng thái dữ liệu cần dọn: document cũ parse fail về default, đúng chủ trương hard cut.

**Điều packet này KHÔNG chứng minh.** Không xoá DEF-008: đường 3 nhanh hơn nhiều (1 POST thay vì cold-start 36–41s) nhưng trần 30s của daemon vẫn còn nguyên cho một endpoint chậm. Không có UI row cho lỗi API (chỉ unit + live RPC).
