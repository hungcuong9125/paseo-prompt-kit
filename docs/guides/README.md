# Hướng dẫn mở rộng PromptKit

Mỗi trang là một công thức làm-theo, có template đi kèm trong `docs/templates/`.
Kiến trúc và ranh giới module: `docs/CORE.md`. Tổng quan mọi điểm mở rộng: `docs/EXTENDING.md`.

| Muốn làm gì | Đọc | Template | Chạm vào code TypeScript? |
|---|---|---|---|
| Thêm một lựa chọn prompt (Action) vào menu pill | [action-packs.md](action-packs.md) | `action-pack.template.json` | Không — một JSON + một dòng barrel |
| Thêm một ngôn ngữ đầu ra vào Settings | [output-languages.md](output-languages.md) | `output-language.template.json` | Không — một JSON + một dòng barrel |
| Thêm protocol API, CLI family, trường settings | `../EXTENDING.md` §2–4 | `api-protocol.template.ts.md`, `cli-family.template.ts.md`, `settings-section.template.tsx.md` | Có |

Sau mọi thay đổi: `npm run gate` xanh, rồi `paseo plugin reload prompt-kit` và kiểm tra trên host thật.
