# PromptKit Core — Change Proposal

> **Trạng thái:** DRAFT — chưa dispatch, chưa có DLF, chờ review ngoài
> **Người đề xuất:** Lead · **Ngày:** 2026-09-21
> **Liên quan:** packet `paseo-prompt-kit-post-release-composer-bug` (active) · `docs/IMPELEMENT_PLAN.md` §0 (đã định hướng Action Registry) · `AGENTS.md` (single live contract, hard cut)
> **Không thuộc tài liệu này:** bug `PromptKit needs one visible Composer.` (điều tra riêng, release v0.1.1)

Tài liệu này là **thay đổi kiến trúc ở tầng CORE**, không phải bugfix. Nó mô tả hiện trạng, khoảng trống, hợp đồng mục tiêu, và các câu hỏi **phải được quyết trước khi dispatch**. Nó không chốt implementation; không có symbol, pseudocode, hay thứ tự sửa file.

---

## 1. Hiện trạng

### 1.1 Cái đã tách đúng

`shared/actions.ts` đã tách **strategy** khỏi **pipeline**:

```ts
export interface PromptActionStrategy {
  systemPrompt(): string;
  taskPrompt(input: { originalPrompt: string }): string;
}
```

`server/rewrite.ts` + `server/generation.ts` chỉ đọc `systemPrompt` / `taskPrompt`; chúng không biết "coding" là gì. Thêm một domain mới **không** phải sửa rewrite engine, validator, provider catalog, hay settings. Đây là nửa đường đúng.

### 1.2 Cái còn khoá cứng

| Vị trí | Nội dung | Hệ quả |
|---|---|---|
| `shared/actions.ts:4` | `export const promptActionIds = ["coding"] as const` | Tập action là hằng số biên dịch |
| `shared/actions.ts:33-45` | `registry` là object literal có kiểu `{ [Id in PromptActionId]: … }` | Thêm id mà quên entry = lỗi type, nhưng id mới vẫn phải sửa file này |
| `shared/actions.ts:47-56` | `promptActions`, `listPromptActions()`, `findPromptAction()` là module-level | Không có đăng ký lúc chạy |
| `shared/rpc.ts:34` | `actionId: z.enum(promptActionIds)` | RPC **từ chối** mọi id ngoài danh sách; id lạ không tới được handler |
| `client/pills/agent-pills.ts:7,25` | `listPromptActions()` import tĩnh, dựng menu một lần lúc đăng ký pill | Menu là ảnh chụp của source, không phải của registry |
| `shared/prompts/coding.ts` | Prompt coding nằm trong module TS | Prompt là **code**, không phải dữ liệu |

### 1.3 Năng lực thực tế

| Khả năng | Hiện tại |
|---|---|
| Strategy tách khỏi pipeline | ✅ |
| Thêm action built-in không viết lại engine | ✅ (vẫn phải sửa `actions.ts` + `rpc.ts`) |
| Registry lúc chạy | ❌ |
| Người ngoài thêm module/action mà không fork | ❌ |
| Manifest/schema cho action | ❌ |
| Action discovery | ❌ |
| Cài Action Pack riêng | ❌ |
| Version contract cho module | ❌ |
| Third-party Action Pack | ❌ |

Kết luận: hiện là **modular nội bộ**, chưa là **CORE để bên ngoài cắm vào**. Muốn thêm `image` / `document` / `research`, người ngoài phải: fork → sửa `promptActionIds` → thêm registry entry → sửa `z.enum` → rebuild plugin.

---

## 2. Mục tiêu và Non-goals

### 2.1 Mục tiêu

1. **Action Registry lúc chạy** — action được nạp, không được biên dịch cứng.
2. **Action Pack khai báo (declarative)** — một thư mục + manifest + prompt, không cần viết TypeScript.
3. **`actions.list` RPC** — menu hỏi Core, không import tĩnh.
4. **`actionId` động** — RPC chấp nhận id hợp lệ theo hợp đồng, handler tự resolve và fail closed khi không có.
5. **Built-in `coding` chuyển thành một Action Pack** — dogfood chính framework; không có nhánh đặc biệt cho built-in.
6. **Version contract** — pack khai báo schema version và pack version; Core từ chối pack không tương thích.

### 2.2 Non-goals (chốt cứng)

- **Không** cho Action Pack chạy JS/TS, npm dependency, hay `require`/`import` động. Pack là JSON + Markdown + dữ liệu đã validate.
- **Không** sandbox, **không** marketplace, **không** cài pack từ URL/network trong bản này.
- **Không** per-pack settings UI trong bản này.
- **Không** đổi ngữ nghĩa rewrite: vẫn một lượt gọi model, vẫn validate protected literals, vẫn không auto-send, vẫn replace Composer.
- **Không** đổi cách ly injection: `escapeWrapperDelimiters` vẫn thuộc Core (xem OQ-6).
- **Không** dual-read: bản này là **hard cut** (mục 10).
- **Không** mobile.

---

## 3. Ranh giới: Core một câu, Pack một câu

- **PromptKit Core** — "sở hữu việc đọc/ghi Composer, chọn model, gọi model, validate output, và nạp action."
- **PromptKit Action Pack** — "sở hữu phần chữ nghĩa của đúng một loại prompt: tên, icon, system prompt, task prompt."

Không có câu nào chứa "and" nối hai trách nhiệm khác loại. Việc gì không nằm trong câu của Core thì thuộc module sở hữu nó, hoặc là module mới đặt tên theo nó.

### 3.1 Module đề xuất

| Module | Trách nhiệm (một câu) |
|---|---|
| `core/composer-bridge` | Chọn đúng Composer của agent đang thao tác và đọc/ghi/focus nó |
| `core/rewrite-engine` | Chạy một lượt rewrite đã resolve model và trả kết quả đã validate |
| `core/model-resolver` | Quyết định provider/model/thinking cho một request |
| `core/action-registry` | Nạp, validate, và tra cứu Action Definition |
| `core/action-pack-loader` | Biến một thư mục pack hợp lệ thành Action Definition |
| `core/settings` | Giữ settings host-scoped |
| `packs/builtin/coding` | Định nghĩa action `coding` dưới dạng pack |

Ghi chú: tên thư mục là đề xuất, **không phải** quyết định của tài liệu này. Điều bắt buộc là ranh giới một-câu ở trên.

---

## 4. Kiến trúc mục tiêu

```text
                        PromptKit Core
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  Composer Bridge      Rewrite Engine        Model Resolver
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                       Action Registry
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  builtin/coding        pack bên thứ ba       pack bên thứ ba
   (đóng gói sẵn)        (declarative)         (declarative)
```

Core **không** biết tên action nào tồn tại. Nó chỉ biết: id hợp lệ, definition hợp lệ, và pipeline.

---

## 5. Hợp đồng Action Pack v1

### 5.1 Bố cục thư mục

```text
<root>/
└── <pack-id>/
    ├── promptkit.action.json
    ├── system.md
    ├── task.md
    └── README.md
```

`system.md` / `task.md` là nội dung prompt thuần. `README.md` cho người đọc, Core không đọc.

### 5.2 Manifest

```json
{
  "schemaVersion": 1,

  "id": "image",
  "version": "1.0.0",

  "title": "Improve image prompt",
  "description": "Optimize a prompt for image generation.",
  "icon": "Image",

  "prompt": {
    "system": "system.md",
    "task": "task.md"
  },

  "context": { "mode": "prompt-only" },
  "output": { "mode": "replace-composer" },
  "guardrails": { "preserveLanguage": true }
}
```

### 5.3 Ràng buộc trường

| Trường | Ràng buộc |
|---|---|
| `schemaVersion` | Số nguyên; bản này chỉ chấp nhận `1`. Không có nhánh v2. |
| `id` | `^[a-z][a-z0-9-]*$`; duy nhất trong toàn bộ registry đã nạp |
| `version` | SemVer hợp lệ |
| `title` / `description` | Chuỗi không rỗng, có giới hạn độ dài |
| `icon` | Tên icon thuộc bộ icon host chấp nhận |
| `prompt.system` / `prompt.task` | Đường dẫn **tương đối trong thư mục pack**; không `..`, không tuyệt đối, không symlink thoát ra ngoài |
| `context.mode` | `"prompt-only"` — giá trị khác là pack không hợp lệ |
| `output.mode` | `"replace-composer"` — giá trị khác là pack không hợp lệ |
| `guardrails.*` | Chỉ khoá đã biết; khoá lạ ⇒ pack không hợp lệ (strict) |

Nguyên tắc: **pack không hợp lệ thì không được nạp**, và **không có fallback** sang pack khác. Sai một pack không được làm hỏng menu hay chọn nhầm action.

### 5.4 Version contract

Ba lớp version phải tách bạch, không được trộn:

1. `schemaVersion` — hình dạng manifest. Bản này = 1.
2. `pack.version` — phiên bản nội dung pack. Core ghi log, không dùng để branch hành vi.
3. `requirements.paseo` của plugin — range tương thích host (xem mục 9).

---

## 6. Built-in `coding` trở thành một pack

**Bắt buộc.** Không được để `coding` là ngoại lệ trong source.

```text
packs/builtin/coding/
├── promptkit.action.json
├── system.md      ← nội dung từ shared/prompts/coding.ts:3-18
├── task.md        ← khuôn task từ shared/prompts/coding.ts:31-38
└── README.md
```

Điều này biến "framework có chạy không" thành một câu hỏi kiểm chứng được: nếu `coding` chạy qua đường pack, thì đường pack chạy. Nếu `coding` được ưu ái riêng, framework chưa được chứng minh.

Lưu ý kỹ thuật: phần `escapeWrapperDelimiters` **không** đi theo pack — nó là cơ chế an toàn của Core (OQ-6).

---

## 7. RPC và menu

### 7.1 `prompt-kit.rewrite`

`actionId` từ `z.enum(promptActionIds)` thành một id hợp lệ theo hợp đồng:

```ts
actionId: z.string().regex(/^[a-z][a-z0-9-]*$/)
```

Handler resolve qua registry. Không có ⇒ lỗi có mã riêng, không được rơi vào nhánh "action mặc định".

### 7.2 `prompt-kit.actions.list`

RPC mới, trả về các action đã nạp và hợp lệ: id, title, description, icon, version. Menu Composer dựng từ RPC này, **không** từ `listPromptActions()`.

Hệ quả: menu phản ánh registry thật tại thời điểm hỏi; action không nạp được thì không xuất hiện, và không có mục "chết" bấm vào rồi báo lỗi.

### 7.3 Fail closed

- id không tồn tại ⇒ lỗi rõ ràng, không rewrite.
- pack hỏng ⇒ action đó vắng mặt; các pack khác không bị ảnh hưởng.
- registry rỗng ⇒ menu rỗng; **không** tự thêm action mặc định.

---

## 8. Câu hỏi phải quyết trước khi dispatch

Đây là phần review cần trả lời. Mỗi câu phải có **một** quyết định, không phải một danh sách lựa chọn.

- **OQ-1 — Nguồn pack.** Chỉ pack đóng gói trong plugin? Chỉ pack người dùng đặt trong thư mục cấu hình? Hay cả hai? Nếu cả hai: thứ tự ưu tiên và xử lý trùng `id` thế nào? *(Ảnh hưởng trực tiếp tới mô hình tin cậy.)*
- **OQ-2 — Tương thích.** Khi `schemaVersion` tăng trong tương lai, Core từ chối pack cũ hay từ chối chính nó? Không được đề xuất dual-read.
- **OQ-3 — Danh tính.** `pack.id` có phải namespaced theo plugin/installation không? Một installation được nạp bao nhiêu pack?
- **OQ-4 — Settings.** Bản này không có settings per-pack. Điều đó có chấp nhận được với `image` (cần aspect ratio, style) hay chỉ hoãn?
- **OQ-5 — Định nghĩa "pack hợp lệ".** Ngoài schema: giới hạn độ dài prompt? Bắt buộc có placeholder `{{prompt}}` trong `task.md`, hay Core tự bọc? Hai lựa chọn này cho hai hợp đồng khác nhau.
- **OQ-6 — Sở hữu ranh giới injection.** `escapeWrapperDelimiters` ở Core (pack không được tự bọc) hay ở pack (Core chỉ chèn)? Chọn sai sẽ mở lại lỗ hổng prompt-injection đã đóng ở DLF-006.
- **OQ-7 — Protected literals.** Validator hiện chạy trên `originalPrompt`. Pack tự do định nghĩa task prompt thì validator có cần thêm ràng buộc theo pack không?
- **OQ-8 — Nội dung pack là dữ liệu tin cậy hay không tin cậy?** Prompt pack là văn bản tác giả viết (khác `<user_prompt>`), nhưng nếu pack đến từ bên thứ ba thì cần tuyên bố rõ.

---

## 9. An toàn

- Pack **không** thực thi code. Đây là ràng buộc kiến trúc, không phải tạm thời.
- Đường dẫn trong manifest resolve **trong** thư mục pack; từ chối `..`, absolute, symlink thoát.
- Không tải pack từ network ở bản này.
- Paseo plugin là trusted, unsandboxed code (docs Paseo). Vì vậy pack declarative **không** làm tăng bề mặt thực thi, nhưng **có** làm tăng bề mặt nội dung: prompt pack là instruction gửi tới model. Cần tuyên bố rõ điều này cho người dùng.
- `requirements.paseo: ">=0.8.0"` hiện tại **quá rộng** cho một plugin bám DOM private: range này bao cả prerelease (qua `stableCore`) và mọi bản tương lai. Cần siết trong một DLF riêng, không trộn vào bản này.

---

## 10. Hard cut — những gì bị xoá

Theo `AGENTS.md`: một hợp đồng sống duy nhất, không dual-read, không shim, không legacy parser.

Bị xoá khỏi source khi bản này landed:

- `promptActionIds` (và kiểu `PromptActionId` suy ra từ nó, nếu không còn chỗ dùng).
- `promptActions` module-level và registry object literal.
- `codingActionStrategy` trong `shared/prompts/coding.ts`.
- `z.enum(promptActionIds)` trong `shared/rpc.ts`.
- Import tĩnh `listPromptActions()` trong `client/pills/agent-pills.ts`.

Quy tắc cho test: sau hard cut, **case âm phải suy ra từ biên hiện tại** (regex id, `schemaVersion`, giới hạn độ dài, trường strict) — không được đặt tên các id đã xoá, không được test "danh sách cũ vắng mặt". Việc rà identifier bị xoá làm bằng `git diff`, không bằng blacklist.

Dev state: reset/rebuild, không có đường migration cho dữ liệu dev cũ.

---

## 11. Acceptance

Claim phải quan sát được, không phải "đã sửa file":

1. Thêm một pack mới **chỉ bằng dữ liệu** ⇒ action xuất hiện trong menu và rewrite chạy được, **không** đổi file TypeScript nào. Bằng chứng: diff rỗng ngoài thư mục pack + log rewrite mang `actionId` mới.
2. `coding` chạy qua đúng đường pack như pack bên thứ ba. Bằng chứng: không còn nhánh code riêng cho `coding`.
3. Pack sai schema / id sai regex / `schemaVersion` sai / đường dẫn thoát thư mục ⇒ action vắng mặt, các action khác vẫn chạy, không có fallback. Bằng chứng: case âm suy từ biên hiện tại.
4. `actions.list` phản ánh registry thật; menu không còn import tĩnh.
5. Không đổi hành vi đã accept: không auto-send, protected literals, injection boundary, timeout, model resolution, settings.
6. Gate xanh, có log gắn tree.

---

## 12. Rollback

Built-in `coding` là dữ liệu. Revert = `git revert` commit của bản này; không có state ngoài git cần dọn, không có migration phải đảo.

---

## 13. Chia release

| Release | Nội dung | Ghi chú |
|---|---|---|
| `v0.1.1` | Bugfix Composer selection (`locateField` + ancestor visibility + thông điệp lỗi tách 0 vs >1) | **Không** trộn với CORE. Xem packet active. |
| `v0.2.0` | PromptKit Core: registry lúc chạy, pack loader, `actions.list`, `actionId` động, built-in coding thành pack | Phụ thuộc OQ-1..OQ-8 đã được quyết |
| sau `v0.2.0` | `promptkit-coding` / `-image` / `-document` / `-research` như pack độc lập | Chỉ khả thi nếu OQ-1 và OQ-3 đã chốt |

Thứ tự là ràng buộc: bugfix trước, CORE sau. Không gộp.

---

## 14. Truy vết

- Định hướng gốc: `docs/IMPELEMENT_PLAN.md` §0 (Action Registry, "thêm action sau mà không thay đổi core flow").
- Quy tắc kiến trúc: `AGENTS.md` (single live contract, hard cut, module boundaries), `framework/module-boundaries.md`.
- Vòng đời packet: `docs/PLANS.md`, `framework/packet-template.md`.
- Quyết định đã khoá liên quan: DLF-003 (target 0.8.0, settings đi kèm RPC), DLF-005 (chỉ dùng `addComposerPill`), DLF-006 (validator fail-closed, injection boundary), DLF-011 (v0.1.0 public).
- Việc hoãn liên quan: DEF-001, DEF-002 (protected literals), DEF-006 (host-load test), DEF-007 (theme).
- Chưa có DLF cho tài liệu này. Chấp nhận nó cần một quyết định của Lead và một packet riêng.
