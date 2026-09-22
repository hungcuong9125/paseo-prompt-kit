import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { actionsListRpc, rewriteRpc } from "../../shared/rpc.js";
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

/**
 * Pill popover for native mobile: opens with the Composer's text, rewrites it
 * at once, Rewrite again replaces in place, Send hands it to the agent and
 * clears the Composer, X keeps everything as it is.
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
    const started = useRef(false);

    const remember = useCallback(
      (next: string) => {
        setValue(next);
        if (agentId !== null) drafts.set(agentId, next);
      },
      [agentId],
    );

    const runRewrite = useCallback(
      async (source: string) => {
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
          const { actions } = await listActions({});
          const action = enabledActions(actions, settings.values)[0];
          if (action === undefined) throw new Error("No PromptKit action is enabled.");
          const output = await rewrite({
            actionId: action.id,
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
      [agentId, listActions, remember, rewrite, settings, toast, workspaceId],
    );

    // On open: read the Composer, show its text, and rewrite it straight away.
    useEffect(() => {
      if (started.current || agentId === null || settings.status === "loading") return;
      started.current = true;
      const lookup = locate(probeRef.current, agentId);
      composerRef.current = lookup;
      const composerText = lookup.ok ? lookup.handle.getText() : "";
      const initial = composerText.trim() !== "" ? composerText : (drafts.get(agentId) ?? "");
      remember(initial);
      if (!lookup.ok) setNote(describeLookupFailure(lookup.reason));
      if (composerText.trim() !== "") void runRewrite(composerText);
    }, [agentId, remember, runRewrite, settings.status]);

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
          placeholder="Write the prompt, then press Rewrite"
          placeholderTextColor={theme.colors.foregroundMuted}
          editable={busy === "idle"}
          returnKeyType="go"
          blurOnSubmit
          onSubmitEditing={() => void runRewrite(value)}
          style={box}
          testID="prompt-kit-sheet-input"
        />
        <Text style={text.muted} testID="prompt-kit-sheet-note">
          {busy === "rewriting"
            ? "Rewriting…"
            : (note ?? "Rewrite replaces the text here. Send hands it to the agent and clears the Composer.")}
        </Text>
        <View style={{ flexDirection: "row", gap: SPACE.md }}>
          <Button
            theme={theme}
            label={busy === "rewriting" ? "Rewriting…" : "Rewrite"}
            fill
            onPress={() => void runRewrite(value)}
            disabled={busy !== "idle" || value.trim() === ""}
            testID="prompt-kit-sheet-rewrite"
          />
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
