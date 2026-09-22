import { createElement, type ReactNode } from "react";

/**
 * Resolves the React Native style shorthands the host's primitives accept.
 *
 * react-native-web turns `paddingHorizontal` into `paddingLeft`/`paddingRight`
 * before it reaches the DOM. A raw `<span>` does not, so this keeps the DOM a
 * test inspects close to what the host renders.
 */
function toWebStyle(style: unknown): Record<string, unknown> | undefined {
  if (style === null || typeof style !== "object") return undefined;
  const { paddingHorizontal, paddingVertical, ...rest } = style as Record<string, unknown>;
  const resolved: Record<string, unknown> = { ...rest };
  if (paddingHorizontal !== undefined) {
    resolved.paddingLeft = paddingHorizontal;
    resolved.paddingRight = paddingHorizontal;
  }
  if (paddingVertical !== undefined) {
    resolved.paddingTop = paddingVertical;
    resolved.paddingBottom = paddingVertical;
  }
  return resolved;
}

/** React Native props that have no DOM meaning; dropping them avoids unknown-prop noise. */
function domProps(props: Record<string, unknown>): Record<string, unknown> {
  const { testID, accessibilityRole, accessibilityLabel, style, ...rest } = props;
  return {
    ...rest,
    ...(testID === undefined ? {} : { "data-testid": testID }),
    ...(accessibilityLabel === undefined ? {} : { "aria-label": accessibilityLabel }),
    ...(accessibilityRole === undefined ? {} : { role: accessibilityRole }),
    style: toWebStyle(style),
  };
}

/**
 * The host supplies `react-native` and `@getpaseo/plugin/client/ui` as runtime
 * modules. Vitest cannot parse React Native's Flow-typed entry, so the DOM
 * renderings below stand in for the host's primitives.
 */
export const reactNativeMock = {
  Text: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement("span", domProps(props), children),
  View: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement("div", domProps(props), children),
  Pressable: ({
    children,
    onPress,
    disabled,
    ...props
  }: { children?: ReactNode; onPress?: () => void; disabled?: boolean } & Record<string, unknown>) =>
    createElement("button", { ...domProps(props), onClick: onPress, disabled }, children),
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
};

function row(
  label: string,
  hint: string | undefined,
  error: string | null | undefined,
  control: ReactNode,
): ReactNode {
  return createElement(
    "div",
    { "data-row": label },
    createElement("span", { "data-row-label": "" }, label),
    hint ? createElement("span", { "data-hint": "" }, hint) : null,
    error ? createElement("span", { "data-error": error }, error) : null,
    control,
  );
}

export const pluginUiMock = {
  SettingsSection: ({
    title,
    trailing,
    children,
  }: {
    title: string;
    trailing?: ReactNode;
    children?: ReactNode;
  }) => createElement("section", { "data-title": title }, trailing ?? null, children),
  SettingsCard: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-card": "" }, children),
  SettingsRow: ({
    label,
    hint,
    error,
    children,
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    children?: ReactNode;
  }) => row(label, hint, error, children ?? null),
  SettingsSwitch: ({
    label,
    hint,
    error,
    value,
    onValueChange,
    disabled,
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    value: boolean;
    onValueChange(value: boolean): void;
    disabled?: boolean;
  }) =>
    row(
      label,
      hint,
      error,
      createElement("input", {
        type: "checkbox",
        "data-label": label,
        checked: value,
        disabled,
        onChange: (event: { target: { checked: boolean } }) => onValueChange(event.target.checked),
      }),
    ),
  SettingsSelect: ({
    label,
    hint,
    error,
    value,
    options,
    onValueChange,
    disabled,
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    value: string;
    options: readonly { label: string; value: string }[];
    onValueChange(value: string): void;
    disabled?: boolean;
  }) =>
    row(
      label,
      hint,
      error,
      createElement(
        "select",
        {
          "data-label": label,
          value,
          disabled,
          onChange: (event: { target: { value: string } }) => onValueChange(event.target.value),
        },
        options.map((option) =>
          createElement("option", { key: option.value, value: option.value }, option.label),
        ),
      ),
    ),
  SettingsInput: ({
    label,
    hint,
    error,
    initialValue,
    onChangeText,
    disabled,
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    initialValue?: string;
    onChangeText(text: string): void;
    disabled?: boolean;
  }) =>
    row(
      label,
      hint,
      error,
      createElement("input", {
        "data-label": label,
        defaultValue: initialValue,
        disabled,
        onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
      }),
    ),
  SettingsAction: ({
    label,
    hint,
    error,
    actionLabel,
    onPress,
    disabled,
  }: {
    label: string;
    hint?: string;
    error?: string | null;
    actionLabel: string;
    onPress(): void;
    disabled?: boolean;
  }) =>
    row(
      label,
      hint,
      error,
      createElement("button", { "data-label": label, onClick: onPress, disabled }, actionLabel),
    ),
};

/** `@getpaseo/plugin/client/react-native`: a DOM textarea and a recording toast. */
export const toastCalls: { kind: "show" | "error"; message: string }[] = [];
export const pluginReactNativeMock = {
  TextInput: ({
    value,
    onChangeText,
    onSubmitEditing,
    editable,
    multiline,
    blurOnSubmit,
    returnKeyType,
    placeholderTextColor,
    ...props
  }: {
    value?: string;
    onChangeText?(text: string): void;
    onSubmitEditing?(): void;
    editable?: boolean;
  } & Record<string, unknown>) =>
    createElement("textarea", {
      ...domProps(props),
      value: value ?? "",
      disabled: editable === false,
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
      onKeyDown: (event: { key: string; preventDefault(): void }) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmitEditing?.();
        }
      },
    }),
  useToast: () => ({
    show: (message: string) => toastCalls.push({ kind: "show", message }),
    error: (message: string) => toastCalls.push({ kind: "error", message }),
  }),
};
