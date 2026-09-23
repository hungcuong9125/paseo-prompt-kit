import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { actionsListRpc, rewriteRpc, type ActionSummary } from "../../shared/rpc.js";
import { promptKitSettings, promptKitSettingsSchema } from "../../shared/settings.js";
import { enabledActions } from "../actions/enabled.js";
import {
  describeLookupFailure,
  fiberOf,
  findComposerHandle,
  type ComposerLookup,
} from "../composer-bridge/fiber.js";
import { Button } from "../settings/ui/button.js";
import { RADIUS, SPACE, textStyles } from "../settings/ui/tokens.js";

/** Locates the agent's Composer from a mounted probe element. */
export type ComposerLocator = (probe: unknown, agentId: string) => ComposerLookup;

export const locateComposerFromProbe: ComposerLocator = (probe, agentId) =>
  findComposerHandle(fiberOf(probe), agentId);

/** Host sheet: body padding 12 + page 4 + title bottom padding 12 + half a title line. */
const HOST_TITLE_CENTER_ABOVE_BODY = 39;
const CLOSE_BUTTON_HEIGHT = 30;
/** Pulls the body up into the host's title padding so the field sits close to the title. */
const BODY_LIFT = SPACE.lg;

/** Text kept per agent while the sheet is closed with X, so reopening resumes. */
const drafts = new Map<string, string>();

/** Action buttons per row when several actions are enabled. */
const ACTIONS_PER_ROW = 2;
/** One grid cell: every cell, filled or empty, takes an equal share of the row. */
const GRID_CELL = { flexGrow: 1, flexShrink: 1, flexBasis: 0 } as const;

function rows<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += ACTIONS_PER_ROW) out.push(items.slice(index, index + ACTIONS_PER_ROW));
  return out;
}

/**
 * Pill popover for native mobile: opens with the Composer's text. With one
 * enabled action it rewrites at once and Rewrite runs it again; with several,
 * each action has its own button and nothing runs until one is pressed. Send
 * hands the text to the agent and clears the Composer, X keeps everything.
 */
export function createRewriteSheet(locate: ComposerLocator): ComponentType<PluginButtonContentProps> {
  return function RewriteSheet(props: PluginButtonContentProps) {
    const { theme, close } = props;
    const agentId = props.context === "agent" ? props.agentId : null;
    const workspaceId = props.workspaceId;
    const paseo = usePaseo();
    const toast = useToast();
    const settings = useSettings(promptKitSettings);
    const rewrite = useRpc(rewriteRpc);
    const listActions = useRpc(actionsListRpc);
    const text = useMemo(() => textStyles(theme), [theme]);
    const probeRef = useRef<unknown>(null);
    const composerRef = useRef<ComposerLookup | null>(null);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState<"idle" | "rewriting" | "sending">("idle");
    const [note, setNote] = useState<string | null>(null);
    /** Enabled actions, null until read. */
    const [choices, setChoices] = useState<readonly ActionSummary[] | null>(null);
    const started = useRef(false);

    const remember = useCallback(
      (next: string) => {
        setValue(next);
        if (agentId !== null) drafts.set(agentId, next);
      },
      [agentId],
    );

    const runRewrite = useCallback(
      async (source: string, actionId: string) => {
        if (settings.status !== "ready") {
          toast.error(settings.status === "loading" ? "Settings are still loading." : settings.error);
          return;
        }
        if (source.trim() === "") {
          toast.error("Write a prompt first.");
          return;
        }
        setBusy("rewriting");
        try {
          const output = await rewrite({
            actionId,
            agentId,
            workspaceId,
            originalPrompt: source,
            settings: promptKitSettingsSchema.parse(settings.values),
          });
          if (output.status === "error") throw new Error(output.error.message);
          remember(output.rewrittenPrompt);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
        } finally {
          setBusy("idle");
        }
      },
      [agentId, remember, rewrite, settings, toast, workspaceId],
    );

    // Read the enabled actions once settings are ready.
    const customActions = settings.status === "ready" ? settings.values.customActions : null;
    useEffect(() => {
      if (settings.status !== "ready" || choices !== null) return;
      const values = settings.values;
      listActions({ customActions: values.customActions })
        .then(({ actions }) => setChoices(enabledActions(actions, values)))
        .catch((error: unknown) => {
          setChoices([]);
          toast.error(error instanceof Error ? error.message : String(error));
        });
    }, [choices, customActions, listActions, settings, toast]);

    // On open: read the Composer and show its text; with one action, rewrite it straight away.
    useEffect(() => {
      if (started.current || agentId === null || choices === null) return;
      started.current = true;
      const lookup = locate(probeRef.current, agentId);
      composerRef.current = lookup;
      const composerText = lookup.ok ? lookup.handle.getText() : "";
      const initial = composerText.trim() !== "" ? composerText : (drafts.get(agentId) ?? "");
      remember(initial);
      if (!lookup.ok) setNote(describeLookupFailure(lookup.reason));
      else if (choices.length === 0) setNote("No PromptKit action is enabled.");
      if (composerText.trim() !== "" && choices.length === 1) void runRewrite(composerText, choices[0]!.id);
    }, [agentId, choices, remember, runRewrite]);

    const send = useCallback(async () => {
      if (busy !== "idle" || agentId === null || value.trim() === "") return;
      setBusy("sending");
      try {
        await paseo.agents.ref(agentId).send(value);
        const lookup = composerRef.current;
        if (lookup?.ok) lookup.handle.replaceText("");
        remember("");
        close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy("idle");
      }
    }, [agentId, busy, close, paseo, remember, toast, value]);

    const box = useMemo(
      () => ({
        minHeight: 140,
        maxHeight: 260,
        padding: SPACE.md,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
        color: theme.colors.foreground,
        opacity: busy === "rewriting" ? 0.45 : 1,
        textAlignVertical: "top" as const,
      }),
      [theme, busy],
    );

    const several = choices !== null && choices.length > 1;
    const only = choices?.length === 1 ? choices[0] : undefined;

    // The host pads the body and draws the title row; X is lifted into that row.
    return (
      <View style={{ gap: SPACE.md, marginTop: -BODY_LIFT }}>
        <View ref={probeRef as never} collapsable={false} testID="prompt-kit-sheet-probe" />
        <View
          style={{
            position: "absolute",
            top: -(HOST_TITLE_CENTER_ABOVE_BODY - BODY_LIFT + CLOSE_BUTTON_HEIGHT / 2),
            right: -SPACE.xs,
            zIndex: 1,
          }}
        >
          <Button theme={theme} label="✕" variant="ghost" onPress={close} disabled={busy !== "idle"} testID="prompt-kit-sheet-close" />
        </View>
        <TextInput
          multiline
          value={value}
          onChangeText={remember}
          placeholder={several ? "Write the prompt, then pick an action" : "Write the prompt, then press Rewrite"}
          placeholderTextColor={theme.colors.foregroundMuted}
          editable={busy === "idle"}
          returnKeyType="go"
          blurOnSubmit
          onSubmitEditing={() => {
            if (only !== undefined) void runRewrite(value, only.id);
          }}
          style={box}
          testID="prompt-kit-sheet-input"
        />
        <Text style={text.muted} testID="prompt-kit-sheet-note">
          {busy === "rewriting"
            ? "Rewriting…"
            : (note ??
              (several
                ? "Pick how to rewrite; the result replaces the text here. Send hands it to the agent and clears the Composer."
                : "Rewrite replaces the text here. Send hands it to the agent and clears the Composer."))}
        </Text>
        {several
          ? rows(choices).map((row) => (
              <View key={row.map((action) => action.id).join(",")} style={{ flexDirection: "row", gap: SPACE.md }}>
                {row.map((action) => (
                  <View key={action.id} style={GRID_CELL}>
                    <Button
                      theme={theme}
                      label={action.title}
                      onPress={() => void runRewrite(value, action.id)}
                      disabled={busy !== "idle" || value.trim() === ""}
                      testID={`prompt-kit-sheet-action-${action.id}`}
                    />
                  </View>
                ))}
                {row.length < ACTIONS_PER_ROW ? <View style={GRID_CELL} /> : null}
              </View>
            ))
          : null}
        <View style={{ flexDirection: "row", gap: SPACE.md }}>
          {several ? null : (
            <Button
              theme={theme}
              label={busy === "rewriting" ? "Rewriting…" : "Rewrite"}
              fill
              onPress={() => {
                if (only !== undefined) void runRewrite(value, only.id);
              }}
              disabled={busy !== "idle" || value.trim() === "" || only === undefined}
              testID="prompt-kit-sheet-rewrite"
            />
          )}
          <Button
            theme={theme}
            label={busy === "sending" ? "Sending…" : "Send"}
            variant="primary"
            fill
            onPress={() => void send()}
            disabled={busy !== "idle" || agentId === null || value.trim() === ""}
            testID="prompt-kit-sheet-send"
          />
        </View>
      </View>
    );
  };
}
