# Template — `client/settings/sections/<name>-section.tsx`

Một section = một nhóm row có cùng lý do tồn tại. Nhận `values` + `patch` từ draft, không giữ
state settings riêng; state cục bộ (đang test, đang mở) thì `useState` trong section.

```tsx
import { SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import type { PromptKitSettings } from "../../../shared/settings.js";
import type { SettingsPatch } from "../draft.js";

export interface MySectionProps {
  values: PromptKitSettings;
  disabled: boolean;
  /** Tăng khi draft bị discard/save; SettingsInput key theo nó để đọc lại initialValue. */
  epoch?: number;
  patch(update: SettingsPatch): void;
}

/** <Một câu: section này cho người dùng quyết định điều gì.> */
export function MySection({ values, disabled, patch }: MySectionProps) {
  return (
    <SettingsSection
      title="My section"
      info="Một câu giải thích section này để làm gì; host render thành tooltip cạnh tiêu đề."
    >
      <SettingsCard>
        <SettingsSwitch
          label="Enable thing"
          hint="Nói hệ quả của giá trị hiện tại, không lặp lại nhãn."
          value={values.myFlag}
          disabled={disabled}
          onValueChange={(next) => patch({ myFlag: next })}
        />
        <SettingsSelect
          label="Mode"
          error={values.myMode === null ? "Choose a mode." : null}
          value={values.myMode ?? ""}
          options={[{ label: "Select…", value: "" }, { label: "Fast", value: "fast" }]}
          disabled={disabled}
          onValueChange={(next) => patch({ myMode: next === "" ? null : next })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
```

Mount trong `settings-screen.tsx` với điều kiện hiển thị (nếu có):

```tsx
{values.transport === "api" ? <MySection values={values} disabled={disabled} patch={draft.patch} /> : null}
```

Quy ước:
- Chữ đi vào `hint`/`error` của row hoặc `info` của section — không `Text` trần trong section.
- Patch có tính chất "đọc-sửa-ghi" (map, mảng) dùng dạng hàm: `patch((current) => ({ ... }))`.
- Giá trị có biên ⇒ thêm rule vào `client/settings/validation.ts`; ảnh hưởng đường chạy ⇒ `readiness.ts`.
