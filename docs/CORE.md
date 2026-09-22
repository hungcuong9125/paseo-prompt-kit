# PromptKit Core — Kiến trúc as-built (v1)

> **Trạng thái:** AS-BUILT — mô tả cấu trúc đang chạy trên `main`.
> **Hợp đồng:** một đường sống duy nhất; không dual-read, không shim, không nhánh version (`AGENTS.md`).
> **Hướng dẫn thêm tính năng:** `docs/EXTENDING.md` (đọc trước khi sửa code).

Tài liệu này trả lời ba câu hỏi: Core gồm những module nào, mỗi module chịu trách nhiệm gì (một câu, không có "và"), và ranh giới nào là do host Paseo áp đặt chứ không phải do ta chọn.

---

## 1. Ràng buộc từ host (không thương lượng được)

Trình biên dịch plugin của Paseo (`packages/server/src/server/plugins/compiler.ts`, `directoryTarget`) chỉ chấp nhận **ba thư mục gốc**:

| Thư mục | Bundle | Được import từ |
|---|---|---|
| `client/` | client (chạy trong app Paseo, React Native Web) | `client/`, `shared/` |
| `server/` | server (chạy trong daemon, Node 20) | `server/`, `shared/` |
| `shared/` | cả hai | chỉ `shared/` |

Cùng với hai entry `index.client.tsx` và `index.server.ts`. **Mọi thư mục gốc khác bị từ chối** khi build (`"invalid"`), nên các module CORE nằm **bên trong** ba thư mục này chứ không phải `core/` hay `packs/` ở gốc.

Hệ quả thứ hai: daemon không bao giờ biết plugin nằm ở đâu trên đĩa (bundle được `eval`, không có install dir). Vì vậy Action Pack là **JSON được bundle lúc biên dịch**, không phải thư mục đọc lúc chạy.

---

## 2. Bố cục và trách nhiệm một câu

```text
index.client.tsx                 Gắn pill + màn Settings vào host; trả cleanup.
index.server.ts                  Đăng ký settings và bốn RPC; composition root của daemon.

shared/                          Hợp đồng chung cho cả hai bundle
  packs/                         ★ ACTION PACKS — dữ liệu thuần, một JSON mỗi action
    index.ts                       Barrel tĩnh: danh sách pack được bundle.
    coding.json                    Pack built-in `coding`, đi đúng đường như pack khác.
  languages/                     ★ NGÔN NGỮ ĐẦU RA — dữ liệu thuần, một JSON mỗi ngôn ngữ
    index.ts                       Barrel tĩnh; `source` (giữ ngôn ngữ gốc) là mặc định built-in.
    en.json, vi.json
  language-registry/             Nạp, validate, tra cứu ngôn ngữ đầu ra (schema/loader/registry)
  action-registry/               Nạp, validate, tra cứu Action Definition
    schema.ts                      Hợp đồng Action Pack v1 (zod strict) + ACTION_ID_PATTERN.
    loader.ts                      Biến barrel thành registry; pack hỏng bị loại riêng lẻ.
    registry.ts                    Registry sống duy nhất; listActions / resolveAction.
    wrapper.ts                     Ranh giới injection của Core: <task>/<user_prompt> + escape;
                                   chèn "Output language: …" vào <task> khi có ngôn ngữ đầu ra.
  settings.ts                    Schema settings host-scoped + hằng số TIMEOUT_MS.
  rpc.ts                         Bốn hợp đồng RPC: rewrite, actions.list, providers, api.test.
  api-protocol.ts                Danh sách protocol API và schema một endpoint.
  cli-families.ts                Danh sách CLI family + quy tắc suy family từ provider id.
  protected-literals.ts          Trích literal phải giữ nguyên qua rewrite.

client/                          Đóng góp phía app
  composer-bridge/               Tìm đúng một Composer đang hiển thị và đọc/ghi/focus nó
    adapter.ts                     Giao diện trung lập nền tảng.
    dom.ts                         Selector + kiểm tra hiển thị theo chuỗi tổ tiên.
    web.ts                         Cài đặt DOM cho Desktop/Web.
  pills/                         Một pill cho mỗi agent sống và đường rewrite được canh gác
    agent-pills.ts                 Đăng ký/gỡ pill theo thư mục agent; hình pill theo tập E.
    rewrite-runner.ts              Đọc Composer → RPC → thay text chỉ khi snapshot còn khớp.
  actions/enabled.ts             Tập E: action đã nạp mà người dùng bật.
  icon.ts                        Icon duy nhất của plugin.
  settings/                      Màn Settings (feature folder)
    settings-screen.tsx            Composition root: status bar + các section theo thứ tự.
    draft.ts                       Hook draft: patch hàm, save theo revision, discard, epoch.
    readiness.ts                   Thuần: rewrite có chạy không, qua đường nào, vì sao không.
    validation.ts                  Thuần: vì sao chưa lưu được (timeout, endpoint, mapping).
    selection.ts                   Thuần: kiểm tra selection dedicated/API (dùng cả ở runner).
    read-settings.ts               Đọc settings qua host RPC cho code ngoài React tree.
    api-endpoints.ts               Preset endpoint + validateEndpoint.
    sections/                      Mỗi section một file, hiện theo giá trị Transport/Model source
      actions-section.tsx
      engine-section.tsx
      dedicated-model-section.tsx
      api-endpoint-section.tsx
      advanced-section.tsx
    ui/                            Ba primitive nhỏ ngoài bộ host: tokens, Button, Notice, StatusBar

server/                          Đóng góp phía daemon
  rewrite-engine/                Chạy một lượt rewrite đã resolve và trả kết quả đã validate
    engine.ts                      resolveTarget → transport → validateRewriteOutput.
    handler.ts                     RPC `prompt-kit.rewrite`: resolve action, log không nội dung.
    output-validator.ts            Từ chối preface/refusal/commentary/mất literal.
  model-resolver/                Quyết định provider/model/thinking và transport cho một request
    resolver.ts                    Ba đường: current-CLI, dedicated-CLI, API. Fail closed.
    provider-catalog.ts            Đọc catalog daemon + trạng thái available.
  transports/                    Cách một prompt đến model
    cli/                           family.ts (4 CLI), process.ts (spawn, kill tree), runner.ts (scratch dir)
    api/                           protocol.ts (interface), openai/anthropic/gemini.ts, key.ts, runner.ts
  log.ts                         Log không bao giờ mang prompt hay output.
  paseo-types.ts                 Kiểu Paseo suy từ SDK server (không import client package).
```

Quy tắc đặt chỗ: việc gì không nằm trong câu của module thì thuộc module sở hữu nó, hoặc là module mới đặt tên theo nó. Không có `utils/`, `common/`, `helpers/`.

---

## 3. Luồng một lượt rewrite

```text
pill press
  └─ rewrite-runner.run(actionId)
       ├─ composer-bridge.readText()            ← từ chối nếu 0 hoặc >1 Composer hiển thị
       ├─ read-settings + selection (pre-flight) ← lỗi cấu hình thành câu, không tới daemon
       └─ rpc prompt-kit.rewrite ──────────────────────────────────────────────┐
                                                                               ▼
                                            handler: resolveAction(actionId) ← unknown_action
                                                     buildTaskPrompt (wrapper Core)
                                            engine:  resolveTarget ──► resolver (3 đường)
                                                     transports/cli | transports/api
                                                     output-validator (protected literals)
       ┌───────────────────────────────────────────────────────────────────────┘
       ├─ isActive() && readText() === snapshot   ← text đổi giữa chừng → giữ nguyên
       └─ composer-bridge.replaceText + focus     ← không bao giờ auto-send
```

---

## 4. Hợp đồng Action Pack v1

Một pack là **dữ liệu**: JSON, không code, không đường dẫn file. Schema strict trong `shared/action-registry/schema.ts`:

| Trường | Ràng buộc |
|---|---|
| `schemaVersion` | literal `1`. Không có nhánh v2. |
| `id` | `^[a-z][a-z0-9-]*$`, duy nhất trong barrel; trùng id ⇒ **cả hai** pack bị loại |
| `version` | số nguyên dương; chỉ để log và hiển thị |
| `enabledByDefault` | boolean; người dùng override bằng `actionEnabled[id]` |
| `title`, `description`, `icon` | chuỗi không rỗng; `icon` là tên Lucide, sai tên thì render trống |
| `context.mode` | `"prompt-only"` |
| `output.mode` | `"replace-composer"` |
| `system`, `task` | văn bản chỉ dẫn, ≤ 50 000 ký tự; **không** tự bọc `<task>`/`<user_prompt>` |

Fail closed: pack sai ⇒ vắng mặt trong `actions.list`, log `action packs rejected`, các pack khác vẫn chạy, không có action mặc định.

Ranh giới injection thuộc Core (`wrapper.ts`), pack không được bọc. Prompt trong pack là văn bản **tác giả plugin** viết, khác `<user_prompt>` là dữ liệu không tin cậy.

---

## 5. RPC

| RPC | Vào | Ra |
|---|---|---|
| `prompt-kit.rewrite` | `actionId` (regex), `agentId`, `workspaceId`, `originalPrompt` ≤ 50 000, `settings` (snapshot, host 0.8.0 không cho server đọc settings) | `ok{rewrittenPrompt, model, durationMs}` hoặc `error{code, message}` |
| `prompt-kit.actions.list` | `{}` | các action đã nạp hợp lệ, **chưa** áp settings |
| `prompt-kit.providers` | `cwd?` | catalog daemon + `available` |
| `prompt-kit.api.test` | một endpoint + `secretsFile` | danh sách model hoặc lỗi có mã |

Menu pill dựng từ `actions.list`, không import tĩnh. Tập bật `E` tính ở client (`client/actions/enabled.ts`).

---

## 6. Settings (host-scoped, version 1)

Hai trục độc lập quyết định đường chạy: `transport` (`cli`|`api`) × `modelMode` (`current`|`dedicated`). Các trường còn lại là hệ quả của hai trục:

- CLI: `dedicatedProvider/Model/ThinkingOptionId`, `providerCli` (override family theo provider id).
- API: `apiEndpoints[]`, `apiEndpointId`, `apiModel`, `apiEndpointByProvider`, `secretsFile`.
- Chung: `timeoutMs` (`TIMEOUT_MS.min..max`, mặc định 90 000; host cắt RPC ở 30 s — DEF-008), `actionEnabled`, `outputLanguage` (`source` hoặc id đã nạp; id lạ ⇒ `invalid_selection`).

Key API **không bao giờ** nằm trong settings (tài liệu này tới browser); chỉ có tên biến, giá trị đọc ở daemon từ env rồi `secrets.json`.

---

## 7. Quyết định đã khoá (trả lời OQ-1..OQ-8 của bản đề xuất)

| OQ | Quyết định |
|---|---|
| OQ-1 Nguồn pack | Chỉ pack **bundle trong plugin** (`shared/packs/`). Pack từ thư mục người dùng/network cần FR upstream (daemon không biết install dir). |
| OQ-2 Tương thích | `schemaVersion` khác `1` ⇒ pack bị loại. Khi cần đổi shape: sửa schema v1 và mọi pack cùng lúc (hard cut). |
| OQ-3 Danh tính | Một namespace phẳng; `id` duy nhất trong barrel; trùng ⇒ loại cả hai. |
| OQ-4 Settings per-pack | Không có. `actionEnabled[id]` là mức duy nhất. |
| OQ-5 Pack hợp lệ | Schema strict + giới hạn 50 000 ký tự. Không placeholder `{{prompt}}`: Core tự bọc. |
| OQ-6 Injection | `escapeWrapperDelimiters` ở Core. |
| OQ-7 Protected literals | Validator chạy trên `originalPrompt`, độc lập pack. |
| OQ-8 Tin cậy | Prompt pack là nội dung tác giả plugin; pack bên thứ ba không tồn tại trong bản này. |

---

## 8. Điểm mở rộng

Năm điểm mở rộng có tên, mỗi điểm một thư mục và một bước đăng ký. Chi tiết: `docs/EXTENDING.md`, từng bước cho hai điểm chỉ-dữ-liệu: `docs/guides/`.

| Muốn thêm | Chạm vào | Không chạm |
|---|---|---|
| Action mới | `shared/packs/<id>.json` + một dòng `shared/packs/index.ts` | engine, validator, RPC, settings, UI |
| Ngôn ngữ đầu ra mới | `shared/languages/<id>.json` + một dòng `shared/languages/index.ts` | wrapper, handler, settings, UI |
| Protocol API mới | `server/transports/api/<protocol>.ts` + `PROTOCOLS` + `API_PROTOCOL_IDS` | resolver, engine |
| CLI family mới | `server/transports/cli/family.ts` + `CLI_FAMILY_IDS` | resolver, engine |
| Trường settings mới | `shared/settings.ts` + một section trong `client/settings/sections/` + `readiness/validation` nếu ảnh hưởng đường chạy | các section khác |

---

## 9. Bất biến phải giữ khi sửa

1. Không auto-send; chỉ thay text Composer khi snapshot còn khớp và pill còn active.
2. Fail closed: lỗi cấu hình/pack/transport là lỗi có mã; không rơi sang endpoint, model, hay transport khác.
3. Prompt không vào `argv`, không vào log; key không vào settings, log, RPC, hay thông điệp lỗi.
4. Một registry, một schema version, một đường rewrite. Không có nhánh riêng cho `coding`.
5. Client và server chỉ gặp nhau qua `shared/`; server không import `@getpaseo/client`.
