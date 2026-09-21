import { createElement, type ReactNode } from "react";

/**
 * The host supplies `react-native` and `@getpaseo/plugin/client/ui` as runtime
 * modules. Vitest cannot parse React Native's Flow-typed entry, so the DOM
 * renderings below stand in for the host's primitives.
 */
export const reactNativeMock = {
  Text: ({ children, ...props }: { children?: ReactNode }) =>
    createElement("span", props, children),
  View: ({ children, ...props }: { children?: ReactNode }) =>
    createElement("div", props, children),
  Pressable: ({
    children,
    onPress,
    ...props
  }: {
    children?: ReactNode;
    onPress?: () => void;
  }) => createElement("button", { ...props, onClick: onPress }, children),
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
};

export const pluginUiMock = {
  SettingsSection: ({ title, children }: { title: string; children?: ReactNode }) =>
    createElement("section", { "data-title": title }, children),
  SettingsCard: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-card": "" }, children),
  SettingsRow: ({
    label,
    error,
    children,
  }: {
    label: string;
    error?: string | null;
    children?: ReactNode;
  }) =>
    createElement(
      "div",
      { "data-label": label },
      error ? createElement("span", { "data-error": error }, error) : null,
      children,
    ),
  SettingsSelect: ({
    label,
    value,
    options,
    onValueChange,
    disabled,
  }: {
    label: string;
    value: string;
    options: readonly { label: string; value: string }[];
    onValueChange(value: string): void;
    disabled?: boolean;
  }) =>
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
  SettingsInput: ({
    label,
    initialValue,
    onChangeText,
    disabled,
  }: {
    label: string;
    initialValue?: string;
    onChangeText(text: string): void;
    disabled?: boolean;
  }) =>
    createElement("input", {
      "data-label": label,
      defaultValue: initialValue,
      disabled,
      onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
    }),
  SettingsAction: ({
    label,
    actionLabel,
    onPress,
    disabled,
  }: {
    label: string;
    actionLabel: string;
    onPress(): void;
    disabled?: boolean;
  }) =>
    createElement("button", { "data-label": label, onClick: onPress, disabled }, actionLabel),
};
