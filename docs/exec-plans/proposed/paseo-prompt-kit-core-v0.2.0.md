# PromptKit Core v0.2.0 — Action Pack framework

Packet ID: `paseo-prompt-kit-core-v0.2.0` · AIT: chưa mở (chờ G0) · Trạng thái: **PROPOSED — chặn ở G0**
Nguồn: `docs/CORE.md` (DRAFT) · Review: `docs/reviews/core-review-lead-claude-fable-5-1-20260921.md` (verdict `FINDINGS`) · Base: `6e6a5e8` (tree `d93dd8ac…`)
Tài liệu này **không** bao gồm bugfix `PromptKit needs one visible Composer.` — đó là packet `paseo-prompt-kit-post-release-composer-bug` (active).

---

## Outcome And Constraints

**Outcome.** PromptKit chạy được nhiều loại prompt mà Core không biết tên action nào tồn tại: action được nạp từ Action Pack khai báo (JSON + Markdown), menu dựng từ `prompt-kit.actions.list`, `actionId` trong RPC là động và fail closed khi không resolve được. `coding` chạy qua đúng đường pack như mọi pack khác. Không còn registry biên dịch.

**Ràng buộc chốt cứng.**

- **Một hợp đồng sống duy nhất** (`AGENTS.md`). Hard cut, không dual-read, không shim, không nhánh version, không parser legacy, không migration cho dữ liệu dev.
- **`schemaVersion` giữ ở 1** cho tới lần ship công khai đầu tiên của Core. Đổi hình dạng = thay v1, không thêm v2. Pack không tương thích bị **từ chối nạp**; Core không bao giờ tự từ chối chính nó.
- **Fail fast, fail closed.** Pack hỏng thì action đó vắng mặt; **không** fallback sang pack khác, **không** action mặc định, **không** âm thầm override pack bundled.
- **Pack là dữ liệu.** Không JS/TS, không npm dependency, không `import`/`require` động, không network, không sandbox, không marketplace trong bản này.
- **Không đổi ngữ nghĩa rewrite đã accept:** một lượt gọi model, protected-literal validator chạy `originalPrompt` → output, không auto-send, chỉ replace Composer, settings host-scoped đi kèm RPC, timeout như cũ.
- **Ranh giới injection thuộc Core.** Core sở hữu wrapper `<user_prompt>` và `escapeWrapperDelimiters`. Pack **chỉ** cấp chữ instruction bên trong. Không có placeholder thô trong pack (OQ-5/OQ-6, xem dưới).
- **Không tự uỷ quyền bằng `docs/IMPELEMENT_PLAN.md`.** §9 của plan đó định nghĩa registry là **mảng biên dịch** (`promptActions: PromptAction[]`) và "V2 chỉ cần thêm object mới" — tức thêm lúc biên dịch. Bước nhảy sang registry lúc chạy + pack khai báo + nguồn bên thứ ba là **scope mới**, cần Human quyết (F-5).
- **Mobile không thuộc phạm vi.**

**Excluded scope.** UI settings per-pack; publish npm; đổi `requirements` của các plugin khác; theme; refactor UI ngoài menu action; push/tag (agent không push).

---

## Context And Ownership

**Hiện trạng bị thay** (đã kiểm chứng tại base `6e6a5e8`):

| Vị trí | Nội dung khoá cứng |
|---|---|
| `shared/actions.ts:4` | `promptActionIds = ["coding"] as const` |
| `shared/actions.ts:8,16,21,33-45` | `PromptActionTaskInput`, `PromptActionStrategy`, `PromptAction`, registry object literal |
| `shared/actions.ts:47-56` | `promptActions`, `listPromptActions()`, `findPromptAction()` |
| `shared/rpc.ts:34` | `actionId: z.enum(promptActionIds)` |
| `shared/prompts/coding.ts:29-38` | `codingActionStrategy` (prompt là code) |
| `client/pills/agent-pills.ts:7,14,25` | `listPromptActions()` import tĩnh; `AgentPillRunner` nhận `PromptActionId` |
| `client/pills/rewrite-runner.ts:5,20,33` | `run(actionId: PromptActionId)` |
| `index.server.ts:2,18` | `findPromptAction(input.actionId)` |

**Seam phải tôn trọng.** `client/composer/web.ts:16-24` `locateField` (đòi đúng một root visible toàn document) là **cùng seam** với module `composer-resolver` của bản này. Bug v0.1.1 và CORE không được sửa seam này hai lần theo hai cách khác nhau: v0.1.1 định nghĩa hợp đồng định-danh-dương (pill/agentId → Composer root); CORE kế thừa nó, không dựng lại.

**Quyết định đã khoá liên quan:** DLF-002 (topology, frozen paths) · DLF-003 (target 0.8.0, settings đi kèm RPC) · DLF-005 (chỉ dùng `addComposerPill`) · DLF-006 (validator fail-closed, injection boundary) · DLF-011 (v0.1.0 public, bất biến).
**Hoãn liên quan:** DEF-001, DEF-002 (protected literals) · DEF-006 (host-load test) · DEF-007 (theme).

**Độc lập của review — ghi nhận trung thực.** Review hiện có do **cùng tác giả** `docs/CORE.md` (Lead) thực hiện; tài liệu review tự cảnh báo điều này ở dòng 5. Vì vậy review này **không** đủ tư cách lane độc lập. Trước khi dispatch Phase 1 phải có **một** review của seat khác tác giả, hoặc một quyết định của Human chấp nhận rủi ro đó bằng văn bản.

---

## Gate G0 — Human decision (chặn toàn bộ packet)

Review kết luận: 8 OQ trong `docs/CORE.md` §8 bị phân loại sai. Sau khi áp luật và DLF:

| OQ | Trạng thái | Cơ sở |
|---|---|---|
| OQ-2 (bump `schemaVersion`) | **DECIDED** | `AGENTS.md`: giữ v1 tới lần ship công khai đầu; thay v1, không v2/v3; không dual-read. Pack không tương thích bị từ chối nạp |
| OQ-5 (placeholder vs Core tự bọc; trần độ dài) | **DECIDED bởi Lead** | Nhất quán `shared/prompts/coding.ts:31-38` (Core dựng wrapper) và DLF-006. **Core bọc + escape; pack không có placeholder thô.** Trần `system.md`/`task.md` suy từ `shared/rpc.ts:37` `.max(50_000)` |
| OQ-6 (ai sở hữu `escapeWrapperDelimiters`) | **DECIDED** | DLF-006 + non-goal. Escaping thuộc Core |
| OQ-7 (protected literals per-pack) | **DECIDED** | Validator chạy `originalPrompt` → output (`server/output-validator.ts`, `shared/protected-literals.ts`), độc lập pack. Pack chỉ đổi chữ instruction, không đổi trích xuất literal, **không thể** làm yếu validator |
| OQ-1 / OQ-3 / OQ-8 | **OPEN — gộp thành MỘT quyết định. Owner: Human** | Cùng gốc: *mô hình tin cậy & nguồn pack* |
| OQ-4 | **OPEN — Owner: Human (scope sản phẩm)** | `image` có đáng ship khi chưa có settings per-pack (aspect ratio, style)? |

**Khuyến nghị của Lead cho OQ-1/3/8:** v0.2.0 chỉ nhận **pack bundled, tin cậy, một namespace**. Điều này sập OQ-1/3/8 thành "bundled-only", bỏ quyết định khó nhất khỏi đường tới hạn, và làm v0.2.0 ship được. Third-party + thư mục người dùng ghi được (mô hình tin cậy đầy đủ) đi packet sau. Cơ chế mở rộng (registry lúc chạy + loader + pack dữ liệu) vẫn có; chỉ bề mặt nguồn-không-tin-cậy bị đóng lại.

**DECISION_REQUEST — copy nguyên khối:**

```text
DECISION_REQUEST — PromptKit Core v0.2.0: mô hình tin cậy nguồn pack, và scope `image`

Evidence
- docs/CORE.md §8 liệt kê OQ-1..OQ-8. Review docs/reviews/core-review-lead-claude-fable-5-1-20260921.md
  kết luận OQ-2/OQ-6/OQ-7 đã bị luật/DLF quyết, OQ-5 Lead chốt được, còn OQ-1/OQ-3/OQ-8 là MỘT quyết
  định gốc (nguồn + độ tin cậy pack) và OQ-4 là scope sản phẩm.
- Hiện trạng: shared/actions.ts:4 + shared/rpc.ts:34 khoá action vào danh sách biên dịch; muốn thêm
  domain mới phải fork, sửa id, sửa z.enum, rebuild.
- docs/IMPELEMENT_PLAN.md §9 (dòng 621-682) chỉ định registry là mảng BIÊN DỊCH; nó không uỷ quyền cho
  registry lúc chạy hay nguồn pack bên thứ ba. Đây là scope mới, cần Human quyết.

Quyết định 1 — nguồn pack cho v0.2.0
  (a) bundled-only, tin cậy, một namespace        ← Lead khuyến nghị
  (b) bundled + thư mục người dùng ghi được
  (c) bundled + người dùng + third-party phân phối được
  Nếu (b) hoặc (c): cần thêm quyết định về precedence và trùng id. Không được để implementer chọn.

Quyết định 2 — `image` không có settings per-pack
  (a) hoãn `image` tới khi có settings per-pack
  (b) ship `image` với prompt thuần, không tham số hoá
  (c) đưa settings per-pack vào chính v0.2.0 (nới scope)

Consequence nếu không quyết
- Không mở được packet CORE; v0.2.0 đứng yên. v0.1.1 (bugfix Composer) không bị chặn và vẫn nên ship.

Smallest decision needed
- Chọn (a)/(b)/(c) cho Quyết định 1 và (a)/(b)/(c) cho Quyết định 2.
```

---

## Direction And Work Units

Topology theo DLF-002 đã chứng minh: **hợp đồng trước, song song sau, tích hợp cuối**. Một người ghi mỗi file.

### Phase 0 — Đóng review (Lead-owned, không cần Human)

| Đơn vị | Nội dung | Write scope |
|---|---|---|
| W0.1 | Sửa `docs/CORE.md` theo F-1..F-5 + bảng OQ ở trên; bỏ OQ đã quyết khỏi danh sách mở; ghi rõ đây là scope **vượt** IMPELEMENT_PLAN §9 | `docs/CORE.md` |
| W0.2 | Sửa §3.1: tách `composer-bridge` thành `composer-resolver` (pill/agentId → root) và `composer-io` (đọc/ghi/focus một root đã cho); chuyển "nạp + validate" từ registry sang loader, registry chỉ "đăng ký + tra cứu" (F-1) | `docs/CORE.md` |
| W0.3 | Sửa §10: bổ sung identifier mồ côi và nêu đích danh test phải viết lại (F-3, xem bảng dưới) | `docs/CORE.md` |
| W0.4 | Sửa §9/§5.3: canonical-hoá `realpath` + khẳng định prefix nằm trong pack root; bổ sung vector id-shadow giữa các nguồn (F-4) | `docs/CORE.md` |

### Phase 1 — Hợp đồng (serial, một seat; đóng băng `shared/**`)

| Đơn vị | Nội dung | Write scope |
|---|---|---|
| W1.1 | Hình dạng Action Definition + schema manifest pack v1 (strict; `schemaVersion` chỉ 1; id `^[a-z][a-z0-9-]*$`; `context.mode`/`output.mode` enum cố định; trần độ dài prompt) | `shared/actions/**` |
| W1.2 | Hợp đồng loader: canonical-hoá đường dẫn rồi khẳng định prefix trong pack root (không kiểm tra lexical `..`); từ chối cả hai khi trùng id; pack hỏng không ảnh hưởng pack khác | `shared/actions/**` |
| W1.3 | Hợp đồng RPC: `prompt-kit.actions.list`; `actionId` động theo regex; mã lỗi riêng cho "action không tồn tại" | `shared/rpc.ts` |
| W1.4 | Hợp đồng resolver Composer: định-danh-dương pill/agentId → một root; fail closed khi không chứng minh được. **Phải khớp hợp đồng mà v0.1.1 thiết lập**, không định nghĩa lại | `shared/**` (kiểu) + ghi chú chuyển cho packet v0.1.1 |

Sau W1.x, `shared/**` đóng băng: thay đổi cần thiết ở Phase 2/3 là `DEPENDENCY_REQUEST` lên Lead, không tự sửa.

### Phase 2 — Triển khai (song song, hai seat, write set rời nhau)

| Đơn vị | Nội dung | Write scope | Phụ thuộc |
|---|---|---|---|
| W2.1 | Loader + Registry lúc chạy: nạp pack, validate, đăng ký, tra cứu; `actions.list` handler; handler rewrite resolve động và fail closed | `server/actions/**`, `index.server.ts` | W1.1, W1.2, W1.3 |
| W2.2 | `composer-resolver` / `composer-io`: kế thừa hợp đồng v0.1.1; I/O giữ cơ chế native-setter hiện có | `client/composer/**` | W1.4, **v0.1.1 đã landed** |

### Phase 3 — Tích hợp và hard cut (serial, một seat)

| Đơn vị | Nội dung | Write scope |
|---|---|---|
| W3.1 | `coding` thành pack dữ liệu: `packs/builtin/coding/{promptkit.action.json,system.md,task.md,README.md}`; nội dung chuyển từ `shared/prompts/coding.ts` | `packs/builtin/**`, `shared/prompts/**` |
| W3.2 | Menu Composer dựng từ `actions.list`, bỏ import tĩnh `listPromptActions()` | `client/pills/agent-pills.ts` |
| W3.3 | Hard cut: xoá toàn bộ identifier ở bảng "Bị xoá"; đổi kiểu `actionId` từ `PromptActionId` sang `string` ở runner và pill | `shared/actions.ts`, `shared/rpc.ts`, `shared/prompts/**`, `client/pills/**`, `index.server.ts` |
| W3.4 | Viết lại test chết theo bảng "Test phải viết lại"; case âm suy từ biên hiện tại (regex id, `schemaVersion`, trần độ dài, trường strict) | `tests/**` |

### Phase 4 — Cổng và xác minh host

| Đơn vị | Nội dung | Ghi chú |
|---|---|---|
| W4.1 | Gate đầy đủ, log gắn tree, `REAL_EXIT` | Một seat duy nhất chạy gate cho cả batch |
| W4.2 | Xác minh host thật qua MultiZen: menu render từ `actions.list`; rewrite end-to-end; không auto-send; injection boundary sống | **Không được giả lập** (bài học DLF-010) |
| W4.3 | Báo cáo Human: version kế tiếp + lệnh push/tag chính xác | Agent không push |

### Bị xoá khi hard cut (F-3a — danh sách đầy đủ)

| Identifier | Vị trí | Ghi chú |
|---|---|---|
| `promptActionIds` | `shared/actions.ts:4` | Nguồn của `z.enum` |
| `PromptActionId` | `shared/actions.ts:6` | **Đang dùng** ở `agent-pills.ts:7,14` và `rewrite-runner.ts:5,20,33` → đổi sang `string`, không phải "nếu còn chỗ dùng" |
| `PromptActionTaskInput` | `shared/actions.ts:8` | Mồ côi khi prompt thành dữ liệu |
| `PromptActionStrategy` | `shared/actions.ts:16` | Mồ côi |
| `PromptAction` | `shared/actions.ts:21` | Thay bằng Action Definition |
| `registry` object literal | `shared/actions.ts:33-45` | Bị loader thay |
| `promptActions`, `listPromptActions()` | `shared/actions.ts:47-51` | Bị `actions.list` thay |
| `findPromptAction` | `shared/actions.ts:53` | Dùng ở `index.server.ts:2,18`; chữ ký phải thành resolve động |
| `codingActionStrategy` | `shared/prompts/coding.ts:29` | Thành dữ liệu pack |
| `z.enum(promptActionIds)` | `shared/rpc.ts:34` | Thành regex id |

### Test phải viết lại, không port (F-3b)

| Test | Vì sao chết |
|---|---|
| `tests/unit/actions.test.ts` (toàn bộ) | Tiền đề là registry biên dịch: `promptActions === ["coding"]`, `listPromptActions === ["coding"]`, `findPromptAction("image")` ném lỗi |
| `tests/jsdom/pill-registration.test.tsx:90` | Menu dựng từ list tĩnh |
| `tests/unit/rewrite-injection.test.ts` | Import `codingActionStrategy` trực tiếp; sau cut phải thành test **nội dung pack** (`system.md`/`task.md`) |

Quy tắc: case âm suy từ biên hiện tại. Không đặt tên id đã xoá, không test "danh sách cũ vắng mặt", không blacklist substring. Rà identifier bị xoá bằng `git diff`.

### Ride-along v0.1.1 — siết `requirements.paseo`

Review xác nhận claim "quá rộng" là **đúng**, kiểm chứng tại `upstreams/paseo/packages/protocol/src/plugin-requirements.ts`: `assertPluginCompatibility` dùng `satisfies(version, range) || satisfies(stableCore, range)` với `stableCore = major.minor.patch` (bỏ prerelease). Với user trên `0.9.0-beta.2`: `satisfies("0.9.0-beta.2", ">=0.8.0")` = false nhưng `satisfies("0.9.0", ">=0.8.0")` = true ⇒ **plugin vẫn nạp**. `>=0.8.0` cũng không có trần ⇒ mọi major/minor tương lai đều qua.

Range trung thực cho plugin bám DOM private: `">=0.8.0 <0.9.0"`. Cái vỡ hôm nay trên `0.9.0-beta.2`: cổng compat PASS, plugin cài và nạp, nhưng nếu selector `message-input-root`/`data-composer-input` bị đổi thì `locateField` trả null → đúng lỗi "PromptKit needs one visible Composer." đang điều tra. Range rộng biến "không tương thích, đừng cài" thành "cài rồi hỏng im lặng".

**Việc cần làm:** `paseo-plugin.json` là **frozen path** (DLF-002) và **không** nằm trong write scope của packet bugfix đang chạy. Siết range cần **một trong hai**: (a) Lead mở rộng packet v0.1.1 bằng một work unit bounded, hoặc (b) một DLF riêng cho phép sửa frozen path. Không gộp vào Phase 1–3 của packet này; đi cùng v0.1.1 vì nó là fix an toàn cho bản public.

---

## Acceptance And Recovery

### Claim và bằng chứng

| # | Claim | Bằng chứng có thể phản bác |
|---|---|---|
| 1 | Thêm một pack mới **chỉ bằng dữ liệu** ⇒ action xuất hiện trong menu và rewrite chạy, **không** đổi file TypeScript | Diff rỗng ngoài thư mục pack + log rewrite mang `actionId` mới. **Chỉ đạt khi OQ-1 đã chốt** và thư mục pack nằm ngoài cây source |
| 2 | `coding` chạy qua **đúng** đường pack như pack khác | Không còn nhánh code riêng cho `coding`; xoá thư mục pack thì action biến mất |
| 3 | Pack sai schema / id sai regex / `schemaVersion` sai / trùng id / đường dẫn thoát pack root ⇒ action vắng mặt, action khác vẫn chạy, không fallback | Case âm suy từ biên hiện tại; có case symlink trỏ ra ngoài (không chứa `..` trong chuỗi) |
| 4 | `actions.list` phản ánh registry thật; menu không còn import tĩnh | Grep `listPromptActions` trong `client/**` = 0 hit; menu đổi khi thêm pack |
| 5 | Không đổi hành vi đã accept | Regression suite hiện có. **Auto-send-never và injection boundary sống là host-only** |
| 6 | Gate xanh, log gắn tree | Log `REAL_EXIT` — đây là **cổng**, không phải bằng chứng outcome |

### Thay thế trung thực nhỏ nhất khi không có host

Phần không kiểm được nếu thiếu host Paseo thật: menu render, rewrite end-to-end, auto-send-never, injection boundary sống. Thay thế: unit test loader (nạp **thư mục pack dữ liệu tạm**) + test `actions.list` RPC + test handler resolve. Phần host **phải** qua MultiZen, **không được giả lập** (bài học DLF-010: bằng chứng jsdom/source không thay thế được host).

### Điều kiện mở lại (reopen_when)

- Human chọn OQ-1 = (b) hoặc (c): toàn bộ W1.2 (precedence, trùng id, mô hình tin cậy) phải viết lại trước Phase 2.
- v0.1.1 không landed trước Phase 2: W2.2 không có hợp đồng resolver để kế thừa → dừng, không tự dựng lại seam.
- Phát hiện 0.9.0-beta.2 đổi selector: ưu tiên siết `requirements.paseo` và xác minh lại DOM trước khi tiếp Phase 3.
- Review độc lập (seat khác tác giả) ra `REOPEN_REQUEST`: dừng Phase 1.

### Rollback

`coding` là dữ liệu pack. Revert = `git revert` commit của packet. Không có state ngoài git, không migration phải đảo, không external side effect. v0.1.0 tag bất biến và không bị chạm.

### Ranh giới release

| Release | Nội dung | Trạng thái |
|---|---|---|
| `v0.1.1` | Bugfix Composer + (ride-along) siết `requirements.paseo` | Packet active, độc lập với tài liệu này |
| `v0.2.0` | PromptKit Core (packet này) | Chặn ở G0 |
| sau `v0.2.0` | `promptkit-*` pack độc lập | Chỉ khả thi nếu OQ-1/OQ-3 đã chốt |

Thứ tự là ràng buộc thật, không phải sở thích: (1) v0.1.1 sửa bug production đang sống cho user v0.1.0 đã public (DLF-011); (2) `composer-resolver` của v0.2.0 là **cùng seam** với `locateField`, nên v0.1.1 định nghĩa hợp đồng mà nó dựa vào. Không gộp.

---

## Progress

- [ ] G0 — Human quyết OQ-1/3/8 và OQ-4
- [ ] Review độc lập (seat khác tác giả) cho `docs/CORE.md` đã sửa
- [ ] Phase 0 — W0.1..W0.4
- [ ] Phase 1 — W1.1..W1.4 (đóng băng `shared/**`)
- [ ] Ride-along — siết `requirements.paseo` (cần Lead mở rộng packet v0.1.1)
- [ ] Phase 2 — W2.1 ∥ W2.2
- [ ] Phase 3 — W3.1..W3.4
- [ ] Phase 4 — W4.1..W4.3
- [ ] DLF cho packet này; mở AIT epic + task

---

## UNKNOWNs carried from review

- **DOM của `0.9.0-beta.2` so với `0.8.0`.** Chưa xác minh `message-input-root` / `data-composer-input` có bị đổi hay di chuyển không. Resolve bằng đối chiếu `upstreams/paseo` (0.9.0-beta.2) với selector ở `client/composer/web.ts:9-10` **trên host thật**, không bằng đọc source. Không chặn Phase 0/1; chặn W2.2 và là cơ sở cho việc siết `requirements.paseo`.
- **Bộ icon host chấp nhận cho trường `icon`.** `docs/CORE.md` §5.3 để `icon` là "tên icon thuộc bộ icon host chấp nhận" nhưng repo chưa đối chiếu danh sách icon 0.8.0. Phải chốt **trước W1.1**, vì W1.1 đóng băng ràng buộc `icon` trong schema manifest; chốt sai thì pack hợp lệ bị từ chối hoặc icon rỗng trong menu.
