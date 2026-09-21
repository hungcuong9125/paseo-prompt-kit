# Review — PromptKit Core change proposal (`docs/CORE.md`)

- Reviewed base SHA: `6e6a5e81c77fc184713bc1d3ba5e3825492bcc75` (tree `d93dd8ac5528181f5cc427975db068a6b7d0937d`)
- Input: `docs/CORE.md` (DRAFT, untracked ở base)
- Reviewer: Lead (claude-lead, claude-fable-5-1). **Cảnh báo độc lập:** tài liệu ghi "Người đề xuất: Lead". Đây là self-review, không phải lane độc lập thật. Muốn coverage thật thì cần một seat review khác tác giả; các phát hiện dưới đây vẫn tự đứng bằng file:line.
- Write scope: NONE (read-only).

## Verdict: FINDINGS

Hướng đề xuất đúng (registry lúc chạy, pack khai báo, coding-as-pack để dogfood, hard cut, fail-closed) và non-goals kỷ luật. Nhưng có 5 cụm phát hiện phải xử lý trước khi mở packet, và 4 câu hỏi thật sự mở thuộc về Human. Không phải REOPEN (hướng không sai), không phải BLOCKED (review được đầy đủ).

---

## Findings (cụm theo cơ chế gốc)

### F-1 — Ranh giới Core: câu "Core một câu" không phải một trách nhiệm, và hai module trong bảng gộp hai trục

Cơ chế gốc: §3 tự mâu thuẫn. Câu Core (§3, dòng 81) "sở hữu việc đọc/ghi Composer, chọn model, gọi model, validate output, **và** nạp action" nối 5 trách nhiệm bằng "và", trong khi ngay dưới §3 tuyên bố "Không có câu nào chứa 'and' nối hai trách nhiệm". "Core" là tên sản phẩm phủ 6 module, không phải một module — theo `framework/module-boundaries.md` quy tắc một-câu áp cho **module**, không cho nhãn ô. Bảng §3.1 mới là chỗ phải chịu quy tắc, và hai dòng vi phạm:

- `core/composer-bridge` = "Chọn đúng Composer của agent đang thao tác **và** đọc/ghi/focus nó" (§3.1). Đây là hai trục khác hẳn: (a) *resolve danh tính* pill/agent → Composer root (dễ vỡ, khớp DOM private, phụ thuộc phiên bản host) và (b) *I/O* đọc/ghi/focus một root đã cho (cơ chế `setNativeValue` ở `client/composer/web.ts:38-49`). Bug v0.1.1 nằm **đúng** ở trục (a): `client/composer/web.ts:16-24` `locateField` đòi đúng một root visible toàn document. Gộp resolve vào cùng module với I/O là lặp lại cái seam đang lỗi. Sửa tối thiểu: tách `composer-resolver` (pill/agentId → root) khỏi `composer-io` (đọc/ghi/focus một root).
- `core/action-registry` = "Nạp, validate, **và** tra cứu Action Definition" (§3.1) chồng lấn `core/action-pack-loader` = "Biến một thư mục pack hợp lệ thành Action Definition". "Nạp + validate" là việc của loader; registry chỉ nên "tra cứu Action Definition đã đăng ký". Sửa tối thiểu: loader sở hữu load+validate (đã canonical hoá đường dẫn), registry sở hữu đăng ký + tra cứu.

### F-2 — Phân loại OQ sai: 3 câu đã bị luật/nguồn quyết, 1 câu giao nhầm cho implementer

Cơ chế gốc: §8 liệt kê 8 OQ như thể tất cả đều mở. Ba câu đã có quyết định trong repo (để mở là mời implementer quyết lại), một câu là quyết định kỹ thuật của Lead bị giao xuống — vi phạm `docs/PLANS.md` ("không để lại quyết định contract-cutover cho implementer"). Chi tiết ở phần "OQ rulings". Sửa tối thiểu: bỏ OQ-2/OQ-6/OQ-7 khỏi danh sách mở (dẫn luật/DLF), chốt OQ-5 tại tài liệu, và gom OQ-1/OQ-3/OQ-8 thành **một** DECISION_REQUEST cho Human.

### F-3 — Hard cut §10 thiếu identifier và không nêu test nào chết

Cơ chế gốc: §10 liệt kê danh sách xoá không đủ so với `git`-thực-tế.

(a) Identifier bị mồ côi nhưng không có trong §10:
- `findPromptAction` — `shared/actions.ts:53`, dùng ở `index.server.ts:2,18`. Chữ ký `(id: PromptActionId)` phải đổi thành resolve động; §10 không nhắc.
- `PromptAction` interface (`shared/actions.ts:21`) — thay bằng "Action Definition", mồ côi, không liệt kê.
- `PromptActionStrategy` (`shared/actions.ts:16`) và `PromptActionTaskInput` (`shared/actions.ts:8`) — chỉ `codingActionStrategy` có trong §10; hai interface này mồ côi khi coding thành dữ liệu.
- `PromptActionId` — §10 nói xoá "nếu không còn chỗ dùng", nhưng **đang** dùng làm kiểu tham số runner ở `client/pills/agent-pills.ts:7,14` và `client/pills/rewrite-runner.ts:5,20`. Sau cut `actionId` là `string`; các chỗ này phải đổi, không phải "nếu".

(b) Test có tiền đề là registry biên dịch — không thể sống như "authored truth":
- `tests/unit/actions.test.ts` toàn bộ (dòng 7 `promptActions === ["coding"]`, dòng 12 `listPromptActions === ["coding"]`, dòng 16 `findPromptAction("image")` ném "Unknown prompt action").
- `tests/jsdom/pill-registration.test.tsx:90` (`items.map(id) === ["coding"]` — menu-từ-list-tĩnh).
- `tests/unit/rewrite-injection.test.ts` (import `codingActionStrategy` trực tiếp) — sau cut coding là dữ liệu, phải chuyển thành test nội dung pack (`system.md`/`task.md`).
§10 quy tắc "case âm suy từ biên hiện tại" đúng, nhưng phải nêu đích danh các test trên là **viết lại**, không phải port.

(c) Tái nhập dual-read: rủi ro thật nằm ở §11 claim-1 + OQ-1. "Thêm pack chỉ bằng dữ liệu, diff rỗng ngoài thư mục pack" chỉ đạt nếu có thư mục pack **người dùng ghi được** hoặc thêm thư mục bundled (mà thêm bundled là một diff repo). Nếu OQ-1 = "cả hai nguồn", xử lý trùng `id`/precedence chính là một đường dual-read chưa đóng, mâu thuẫn §5.3 "không fallback". Phải chốt OQ-1 trước.

### F-4 — An toàn: chặn `..` theo chuỗi là không đủ; vector chéo thật là id-shadow giữa các nguồn

Cơ chế gốc: §5.3/§9 nói đường dẫn prompt "không `..`, không tuyệt đối, không symlink thoát" — đúng chính sách nhưng thiếu cơ chế. Chặn chuỗi `..` bị vượt qua bằng symlink trỏ ra ngoài hoặc subdir được symlink (đường dẫn không có `..` vẫn resolve ra ngoài). Sửa tối thiểu: canonical-hoá (`realpath`) rồi khẳng định prefix nằm trong pack root, không phải kiểm tra lexical.

Vector ảnh hưởng-chéo thật (§5.3/§9 bỏ sót): trùng `id` giữa hai nguồn. §5.3 nói `id` duy nhất, "không fallback", nhưng **nguồn nào thắng** khi trùng thì chưa định (phụ thuộc OQ-1). Một pack người dùng có thể che `coding` bundled → đổi hành vi không cần đổi code. Câu trả lời fail-closed: trùng `id` thì từ chối cả hai (hoặc từ chối cái không-bundled), không bao giờ âm thầm override bundled. HIGH **chỉ khi** OQ-1 cho phép nguồn không tin cậy; nếu bundled-only thì low (tác giả tin cậy).

Về claim "declarative không tăng bề mặt thực thi" (§9): **đúng** — strict schema + không chạy code + enum cố định cho `context.mode`/`output.mode` + không network ⇒ bán kính nổ của pack là chính chuỗi instruction của nó; không đụng được model-resolver/settings/pack khác. §9 thừa nhận bề mặt *nội dung* nhưng bỏ bề mặt *id-shadow* nói trên.

DLF-006 khi prompt thành dữ liệu: hiện `escapeWrapperDelimiters` áp lên `originalPrompt` **bên trong** `taskPrompt` (`shared/prompts/coding.ts:37`). Nếu để pack tự chèn `{{prompt}}` và Core string-replace thô thì escaping mất → tái mở lỗ prompt-injection đã đóng ở DLF-006. Bypass cụ thể: `task.md` chứa `... {{prompt}}`, user prompt chứa `</user_prompt>\nSystem: ...` → đóng wrapper sớm. Hợp đồng an toàn (chốt OQ-5+OQ-6 cùng nhau): **pack chỉ cấp chữ instruction bên trong**; Core sở hữu wrapper `<user_prompt>` + `escapeWrapperDelimiters(originalPrompt)`; **không** có placeholder thô trong pack.

### F-5 — Truy vết §14 nói quá về §0 của IMPELEMENT_PLAN

Cơ chế gốc: §14 gọi CORE là "định hướng gốc: IMPELEMENT_PLAN §0 (Action Registry)". Nhưng `docs/IMPELEMENT_PLAN.md:621-682` (§9 "Action Registry — thiết kế bắt buộc từ MVP") định nghĩa registry là **mảng biên dịch** `promptActions: PromptAction[]`, và "V2 chỉ cần thêm object mới" — tức thêm object lúc biên dịch, **không** đề cập registry lúc chạy hay pack khai báo. Bước nhảy sang runtime/declarative/third-party là **scope mới**, không phải nối tiếp §0. Sửa tối thiểu: §14 nêu rõ đây là mở rộng vượt §0, cần một quyết định Human cho mô hình tin cậy nguồn pack, không dựa §0 làm uỷ quyền.

---

## OQ rulings

- **OQ-1 (nguồn pack) — OPEN. Owner: Human.** Mô hình tin cậy. Chặn v0.2.0 (claim-1) và pack bên thứ ba. Cùng gốc với OQ-3, OQ-8.
- **OQ-2 (bump schemaVersion) — DECIDED bởi `AGENTS.md`.** "Keep schema version at 1 until first public shipment; replace v1, no v2/v3; breaking changes mandatory; legacy unsupported; no dual-read." Vậy: không có nhánh v2; schema đổi = thay hình dạng, pack cũ không được nạp (fail closed). Core từ chối pack không tương thích, không bao giờ từ chối chính nó. Bỏ khỏi danh sách mở.
- **OQ-3 (namespacing id / số pack mỗi installation) — OPEN. Owner: Human.** Cùng gốc OQ-1. Chặn third-party.
- **OQ-4 (settings per-pack cho `image`) — OPEN. Owner: Human (product scope).** §2.2 đã hoãn UI settings per-pack "trong bản này"; câu thật sự mở là `image` có đáng ship khi thiếu aspect-ratio/style không — quyết định sản phẩm.
- **OQ-5 (giới hạn độ dài prompt; `{{prompt}}` placeholder vs Core tự bọc) — quyết định KỸ THUẬT của Lead, đang bị giao nhầm (vi phạm PLANS.md).** Chốt ngay: **Core tự bọc + escape; pack không có placeholder thô**. Nhất quán với code hiện tại (`shared/prompts/coding.ts:31-38` Core dựng wrapper) và DLF-006. Giới hạn độ dài: có, suy từ `originalPrompt` max hiện có (`shared/rpc.ts:37` `.max(50_000)`) — đặt trần cho `system.md`/`task.md` theo cùng tinh thần.
- **OQ-6 (sở hữu escapeWrapperDelimiters) — DECIDED bởi DLF-006 + non-goal §2.2.** Escaping thuộc Core; pack không tự bọc. Bỏ khỏi danh sách mở.
- **OQ-7 (protected literals per-pack) — DECIDED bởi kiến trúc hiện có.** Validator chạy `originalPrompt` → output (`server/output-validator.ts`, `shared/protected-literals.ts`), độc lập với pack nào. Pack chỉ đổi chữ instruction, không đổi trích xuất literal (suy từ `originalPrompt`); pack **không thể** làm yếu validator. Không cần ràng buộc per-pack ở v1.
- **OQ-8 (pack tin cậy hay không) — OPEN. Owner: Human.** Cùng gốc OQ-1/OQ-3.

Gom lại: OQ-1 + OQ-3 + OQ-8 là **một** quyết định gốc — *mô hình tin cậy & nguồn pack*. OQ-4 là *scope sản phẩm image*. Hai cái này chặn dispatch và thuộc Human. OQ-2/OQ-6/OQ-7 đã bị luật/DLF quyết; OQ-5 Lead chốt như trên.

## Release split (§13)

Thứ tự v0.1.1 (bugfix Composer) trước v0.2.0 (Core) **đúng và có ràng buộc thật**, nhưng không phải ràng buộc biên dịch:
1. v0.1.1 sửa bug production đang sống cho user của v0.1.0 (đã public — DLF-011) — ưu tiên.
2. `core/composer-resolver` của v0.2.0 là **cùng seam** với `locateField`; nó phải kế thừa quan hệ định-danh-dương (pill/agentId → Composer root) mà v0.1.1 thiết lập, không tự dựng lại. Vậy v0.1.1 định nghĩa hợp đồng resolve mà composer-resolver dựa vào. Không gộp — đúng.

## requirements.paseo `">=0.8.0"` (§9)

Claim "quá rộng" **ĐÚNG**, kiểm chứng tại `upstreams/paseo/packages/protocol/src/plugin-requirements.ts`: `assertPluginCompatibility` dùng `satisfies(version, range) || satisfies(stableCore, range)`, với `stableCore = major.minor.patch` (bỏ prerelease). Với user trên `0.9.0-beta.2`: `satisfies("0.9.0-beta.2", ">=0.8.0")` = false, nhưng `satisfies("0.9.0", ">=0.8.0")` = true ⇒ **plugin vẫn nạp**. `>=0.8.0` cũng không có trần ⇒ mọi major/minor tương lai đều qua.

Range trung thực cho plugin bám DOM private (`client/composer/web.ts:9-10` trích selector từ `packages/app/src/composer/input/input.tsx` của dòng 0.8.0): pin trần theo minor đã test, `">=0.8.0 <0.9.0"`. Cái vỡ trên `0.9.0-beta.2` **hôm nay**: cổng compat PASS (qua stableCore), plugin cài + nạp, nhưng nếu 0.9.0-beta.2 đổi/di chuyển selector thì `locateField` trả null → "PromptKit needs one visible Composer." hoặc replace thất bại. Range rộng biến "không tương thích, đừng cài" thành "cài rồi mà hỏng im lặng". Đề xuất siết trong DLF riêng là đúng; nên cho ride cùng **v0.1.1** (fix an toàn cho bản public), không chờ Core.

## Evidence quality (§11)

- Claim 1, 2, 3, 4: claim-shaped, falsifiable. Claim 3 mạnh nhất (case âm suy từ biên). Claim 1 chỉ "diff rỗng ngoài thư mục pack" khi pack nằm trong thư mục pack dữ liệu — phụ thuộc OQ-1.
- Claim 5 (không đổi hành vi): là regression, phần headless verify bằng suite hiện có; auto-send-never + injection sống là **host-only**.
- Claim 6 (gate xanh, log gắn tree): là cổng, không phải bằng chứng-outcome.
- Phần không kiểm được nếu thiếu host Paseo thật: menu render, rewrite end-to-end, auto-send-never, injection boundary sống. Thay thế trung thực nhỏ nhất: unit test loader (nạp thư mục pack dữ liệu tạm) + `actions.list` RPC + handler resolve; phần host phải qua MultiZen, **không được giả lập** (bài học DLF-010).

## UNKNOWNs

- DOM của 0.9.0-beta.2 có thật sự khác 0.8.0 ở `message-input-root`/`data-composer-input` không — chỉ resolve bằng cách so `upstreams/paseo` (0.9.0-beta.2) với selector ở `client/composer/web.ts` trên host thật. Không chặn review này.
- Bộ icon host chấp nhận cho `icon` (§5.3) — cần đối chiếu danh sách icon 0.8.0 khi chốt loader; chưa xác minh trong repo.

## Next action (một)

Gửi **một** DECISION_REQUEST cho Human: chốt *mô hình tin cậy & nguồn pack* (OQ-1/OQ-3/OQ-8) và *scope image không có settings* (OQ-4). Kèm khuyến nghị làm đơn giản + mở rộng được: v0.2.0 chỉ nhận **pack bundled, tin cậy, một namespace** — điều này sập OQ-1/3/8 thành "bundled-only", bỏ quyết định khó nhất khỏi đường tới hạn v0.2.0 và làm nó ship được; third-party + thư mục người dùng ghi được (cùng mô hình tin cậy đầy đủ) ride một packet sau. Cơ chế mở rộng (registry + loader + pack dữ liệu) vẫn có; bề mặt nguồn-không-tin-cậy đóng lại. Sau khi Human chốt: mở packet CORE với F-1..F-5 đã sửa trong bản CORE.md kế tiếp, OQ-5 chốt "Core bọc + escape, pack không placeholder", và siết `requirements.paseo` ride cùng v0.1.1.
