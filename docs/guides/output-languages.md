# Thêm một ngôn ngữ đầu ra

Settings → **Rewrite engine → Output language** quyết định ngôn ngữ của prompt sau khi rewrite:

- **Same as the prompt** (mặc định): giữ nguyên ngôn ngữ bạn viết. Không chèn gì thêm.
- **English**, **Tiếng Việt**, …: phần văn xuôi được dịch sang ngôn ngữ đó; đường dẫn, lệnh,
  code, tên model/tool giữ nguyên (validator vẫn kiểm tra).

Mỗi ngôn ngữ là **một file JSON** dưới `shared/languages/`. Core nạp, validate, và khi bạn chọn
nó, chèn câu `instruction` vào khối `<task>` gửi cho model. Thêm ngôn ngữ **không cần sửa
TypeScript**.

## Bước 1 — Tạo file từ template

```bash
cp docs/templates/output-language.template.json shared/languages/ja.json
```

## Bước 2 — Điền nội dung

| Trường | Ý nghĩa | Ràng buộc |
|---|---|---|
| `schemaVersion` | luôn `1` | |
| `id` | giá trị lưu trong settings `outputLanguage` | `^[a-z][a-z0-9-]*$`, duy nhất, không được là `source` |
| `label` | tên hiển thị trong select | ≤ 80 ký tự; viết bằng chính ngôn ngữ đó là dễ nhận nhất |
| `instruction` | câu Core gửi cho model, **viết bằng tiếng Anh** | ≤ 2 000 ký tự |

Ví dụ `shared/languages/ja.json`:

```json
{
  "schemaVersion": 1,
  "id": "ja",
  "label": "日本語",
  "instruction": "Write the rewritten prompt in Japanese. Translate the user's prose; keep every technical literal (paths, URLs, commands, code, identifiers, model and tool names) exactly as written."
}
```

Giữ vế "keep every technical literal …" trong `instruction`: nếu model dịch cả tên file hay lệnh,
validator sẽ từ chối rewrite vì mất protected literal.

## Bước 3 — Đăng ký vào barrel

`shared/languages/index.ts`:

```ts
import en from "../languages/en.json";
import vi from "../languages/vi.json";
import ja from "../languages/ja.json";

export const bundledLanguages: readonly unknown[] = [en, vi, ja];
```

Thứ tự trong mảng là thứ tự trong select (sau "Same as the prompt").

## Bước 4 — Kiểm chứng

```bash
npm run gate                      # tests/unit/languages.test.ts nạp barrel thật
paseo plugin reload prompt-kit
paseo plugin logs prompt-kit      # KHÔNG được có dòng "output languages rejected"
```

Mở Settings → Rewrite engine → Output language: có mục mới. Chọn, Save, rồi bấm pill trong một
Composer có prompt: kết quả phải ở ngôn ngữ đó và mọi literal còn nguyên.

## Cách Core dùng ngôn ngữ (để hiểu, không cần sửa)

- `shared/language-registry/` nạp barrel và cung cấp `resolveLanguage(id)`:
  `source` ⇒ không chèn gì; id đã nạp ⇒ `instruction`; id lạ ⇒ từ chối rewrite (`invalid_selection`).
- `shared/action-registry/wrapper.ts` chèn `Output language: <instruction>` **bên trong** `<task>`,
  không bao giờ trong `<user_prompt>`, nên prompt người dùng không thể giả mạo nó.
- Pack `coding` có câu *"Preserve the user's language unless the task names an output language"*.
  Pack mới nên có câu tương tự (xem [action-packs.md](action-packs.md)).
- Settings đang giữ một id không còn được nạp (bạn xoá file) thì status bar báo
  *No output language is loaded with the id "…"* và rewrite bị chặn cho tới khi chọn lại.
