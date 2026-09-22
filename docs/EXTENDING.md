# Mở rộng PromptKit — thêm ở đâu, thêm thế nào

Đọc `docs/CORE.md` §2 trước để biết module nào sở hữu việc gì. Trang này là các
công thức làm-theo cho bốn loại mở rộng thường gặp, kèm template. Mỗi công thức
kết thúc bằng cách kiểm chứng: `npm run gate` phải xanh và, với thay đổi phía
client, `paseo plugin reload prompt-kit` rồi mở màn Settings.

Quy tắc chung (từ `AGENTS.md`):

- Một file một trách nhiệm, nói được bằng một câu không có "và".
- Không thêm fallback, shim, dual-read, hay nhánh version. Sai thì fail closed.
- Test âm suy từ hằng số hiện tại (`ACTION_ID_PATTERN`, `TIMEOUT_MS`, `MAX_INSTRUCTION_CHARS`), không nêu tên thứ đã xoá.
- Thư mục gốc chỉ có `client/`, `server/`, `shared/` — host từ chối mọi thư mục gốc khác.

---

## 1. Thêm một Action (Action Pack)

**Kết quả:** một mục mới trong menu pill, chạy qua đúng đường như `coding`, **không sửa TypeScript**.

1. Sao chép template `docs/templates/action-pack.template.json` thành `shared/packs/<id>.json`.
   `id` khớp `^[a-z][a-z0-9-]*$` và trùng tên file.
2. Điền `title`, `description`, `icon` (tên icon Lucide, ví dụ `Image`, `FileText`, `Search`).
3. Viết `system` (vai trò + quy tắc) và `task` (một đoạn ngắn nói rõ đầu ra). **Không** tự bọc
   `<task>` / `<user_prompt>`: Core bọc và escape (`shared/action-registry/wrapper.ts`).
   Nếu prompt cần giữ ngôn ngữ người dùng hay literal kỹ thuật, ghi rõ trong `system`
   — validator vẫn kiểm tra protected literals bất kể pack nói gì.
4. Thêm một dòng vào `shared/packs/index.ts`:

   ```ts
   import image from "../packs/image.json";
   export const bundledPacks: readonly unknown[] = [coding, image];
   ```

5. Kiểm chứng:
   - `npm run gate` — `tests/unit/actions.test.ts` nạp barrel thật; pack sai schema sẽ hiện trong `listRejectedPacks()`.
   - `paseo plugin reload prompt-kit` rồi `paseo plugin logs prompt-kit`: không có dòng `action packs rejected`.
   - Mở Settings → mục **Actions** có switch mới; bật hai action trở lên thì pill thành menu.

Ràng buộc: `system`/`task` ≤ 50 000 ký tự, `schemaVersion` = 1, `context.mode` = `prompt-only`,
`output.mode` = `replace-composer`. Trường lạ ⇒ pack bị loại (schema strict).

---

## 2. Thêm một protocol API

**Kết quả:** endpoint kiểu mới chọn được trong Settings → API endpoint → Protocol.
(Chỉ cần khi vendor **không** nói OpenAI/Anthropic/Gemini shape. Vendor mới cùng shape = một preset, xem §5.)

1. Tạo `server/transports/api/<protocol>.ts` theo `docs/templates/api-protocol.template.ts.md`.
   Một module sở hữu đúng ba việc: dựng request, đọc answer, liệt kê model.
2. Đăng ký:
   - `shared/api-protocol.ts`: thêm id vào `API_PROTOCOL_IDS`.
   - `server/transports/api/runner.ts`: thêm vào `PROTOCOLS`.
   - `client/settings/api-endpoints.ts`: thêm vào `PROTOCOL_OPTIONS` (nhãn hiển thị).
3. Test: thêm `describe` vào `tests/unit/api-protocols.test.ts` theo mẫu ba protocol có sẵn
   (request đúng URL/header/body, parse answer, parse danh sách model, key rỗng ⇒ không gửi header).
4. `tests/unit/api-endpoints.test.ts` có row "covers all three protocols" — cập nhật tập protocol ở đó.

---

## 3. Thêm một CLI family

**Kết quả:** provider chạy bằng CLI mới rewrite được qua transport `cli`.

1. `shared/cli-families.ts`: thêm id vào `CLI_FAMILY_IDS`. Id này cũng là **tên binary** và
   là chuỗi mà quy tắc `resolveCliFamilyId` khớp với provider id (`<id>`, `<id>-*`, `*-<id>`).
2. `server/transports/cli/family.ts`: thêm một `CliFamily` theo `docs/templates/cli-family.template.ts.md`
   và đưa vào mảng `FAMILIES`. Bắt buộc: prompt đi qua `stdin` hoặc file, **không** qua `argv`;
   tắt tool/context/session nếu CLI có cờ; parse đúng định dạng JSON của CLI đó.
3. Test: `tests/unit/cli-family.test.ts` (argv không chứa prompt, cờ đúng, parser đúng),
   `tests/server/harness.ts` → `stdoutFor()` thêm mẫu stdout của CLI mới.
4. Probe sống (tuỳ chọn): `npx tsx scripts/probe-cli.ts` với model rẻ (DLF-013).

Màn Settings → Advanced → "CLI per provider" tự liệt kê family mới vì đọc `CLI_FAMILY_IDS`.

---

## 4. Thêm một trường settings hoặc một section

**Kết quả:** trường mới có schema, có UI, có kiểm tra trước khi lưu, và (nếu ảnh hưởng đường chạy) hiện trong status bar.

1. `shared/settings.ts`: thêm trường với `.default(...)` để `{}` vẫn parse. Không đổi `version`.
2. Nếu trường quyết định rewrite chạy hay không: sửa `client/settings/selection.ts`
   (dùng chung với `rewrite-runner`) và `server/model-resolver/resolver.ts` — hai bên phải từ chối cùng một lý do.
3. UI:
   - Trường thuộc section có sẵn → thêm một row vào section đó.
   - Nhóm mới → tạo `client/settings/sections/<name>-section.tsx` theo
     `docs/templates/settings-section.template.tsx.md`, rồi mount trong `settings-screen.tsx`
     đúng vị trí trong thứ tự đọc (Actions → Rewrite engine → section phụ thuộc → Advanced).
   - Section chỉ hiện khi có nghĩa: điều kiện `values.transport` / `values.modelMode` đặt ở `settings-screen.tsx`.
4. Giá trị có biên → `client/settings/validation.ts` (`findSaveProblem`) để Save bị chặn với một câu rõ,
   thay vì lỗi schema từ host.
5. Test: `tests/unit/settings.test.ts` (default + biên), `tests/unit/settings-validation.test.ts`,
   `tests/jsdom/settings-screen.test.tsx` (row hiện đúng lúc, Save gửi đúng giá trị).
6. README §Settings: một dòng cho trường mới.

Primitive UI: dùng bộ host (`SettingsSection/Card/Row/Switch/Select/Input/Action`) cho mọi row;
`client/settings/ui/` chỉ có `Button`, `Notice`, `StatusBar` cho phần nằm ngoài row. Không thêm
`Text` trần vào section — đưa chữ vào `hint`/`error` của row hoặc `info` của section.

---

## 5. Thêm một preset endpoint (không cần code mới)

`client/settings/api-endpoints.ts` → `ENDPOINT_PRESETS`: id, nhãn, protocol, base URL, tên biến key
mặc định, ghi chú ngắn. `tests/unit/api-endpoints.test.ts` tự kiểm tra preset parse được và id duy nhất.

---

## 6. Checklist trước khi commit

- [ ] `npm run gate` xanh (typecheck + unit + jsdom + host-load).
- [ ] `bash framework/tools/file-size-audit.sh`: không file nào vượt band mà không có lý do.
- [ ] Không identifier/literal đã xoá còn sót trong code, test, fixture (`git diff` để rà).
- [ ] Thay đổi phía client: đã `paseo plugin reload prompt-kit` và mở Settings/pill trên host thật.
- [ ] README cập nhật nếu hành vi người dùng thấy được thay đổi.
