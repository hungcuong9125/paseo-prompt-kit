import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Text, View } from "react-native";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { actionsListRpc, newRequestId, rewriteResultRpc, rewriteRpc, type ActionSummary } from "../../shared/rpc.js";
import { promptKitSettings, promptKitSettingsSchema, effectiveTimeoutMs } from "../../shared/settings.js";
import { enabledActions } from "../actions/enabled.js";
import {
  describeLookupFailure,
  fiberOf,
  findComposerHandle,
  type ComposerLookup,
} from "../composer-bridge/fiber.js";
import { Button } from "../settings/ui/button.js";
import { applyUiLanguage, tNow, useI18n } from "../i18n/core.js";
import { localizedRewriteError } from "../i18n/errors.js";
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
 * The last rewrite this plugin delivered into each agent's Composer. One
 * record per agent answers every question about delivered text: what the
 * Composer should hold (`composed`), what the sheet and Send carry
 * (`rewritten`), and what the rewrite started from (`original`). Reopening on
 * exactly `composed` resumes from `rewritten` instead of re-rewriting the
 * delivery; anything else is the user's text and re-arms the auto-rewrite.
 */
const deliveryRecords = new Map<string, { composed: string; rewritten: string; original: string }>();

/**
 * The rewrite in flight per agent — identity only. The result itself travels
 * through the verdict archive (`prompt-kit.rewrite.result`), so every sheet
 * instance (the one that fired the RPC or one reopened later) races the same
 * poll; no promise plumbing is shared across instances. The identity lets a
 * reopened sheet reuse the running run instead of firing a duplicate, and
 * keeps a mismatched request (edited text, other action) from riding it.
 */
const inFlightByAgent = new Map<string, { requestId: string; source: string; actionId: string }>();

/** Test seam: forgets every in-flight rewrite between tests. */
export function forgetInFlightRewrites(): void {
  inFlightByAgent.clear();
}

/** Test seam: forgets every per-agent sheet draft and delivery record between tests. */
export function forgetDrafts(): void {
  drafts.clear();
  deliveryRecords.clear();
}

/** What the Composer receives when a rewrite lands: the rewrite alone, or
 *  both versions — rewrite on top, original below the marker — when the
 *  keep-original switch is on. What reaches the agent is always the rewrite. */
function composeDelivery(rewritten: string, original: string, includeOriginal: boolean, marker: string): string {
  return includeOriginal && original.trim() !== "" ? `${rewritten}\n\n${marker}\n${original}` : rewritten;
}

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
 * hands the text to the agent and clears the Composer when it still holds
 * what this sheet wrote into it or found there; X keeps everything.
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
    const rewriteResult = useRpc(rewriteResultRpc);
    const listActions = useRpc(actionsListRpc);
    const text = useMemo(() => textStyles(theme), [theme]);
    const { t } = useI18n();
    const probeRef = useRef<unknown>(null);
    const composerRef = useRef<ComposerLookup | null>(null);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState<"idle" | "rewriting" | "sending">("idle");
    const [note, setNote] = useState<string | null>(null);
    /** Enabled actions, null until read. */
    const [choices, setChoices] = useState<readonly ActionSummary[] | null>(null);
    const started = useRef(false);
    /** The Composer text this sheet expects right now: the open-time text, or
     *  the delivered composition once a rewrite lands. Delivery only writes
     *  over a Composer that matches it — anything else is the user's edit. */
    const expected = useRef("");
    /** The text the current rewrite started from (keep-original composition base). */
    const original = useRef("");
    const mounted = useRef(true);
    const inFlight = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    const remember = useCallback(
      (next: string) => {
        setValue(next);
        if (agentId !== null) drafts.set(agentId, next);
      },
      [agentId],
    );

    // Composer delivery, per the Interface switch. Runs even after the sheet
    // unmounted — the Composer is the delivery surface on mobile — but a
    // mounted sheet re-locates the Composer first: the host may rebuild the
    // Composer's fiber (keyboard, focus, agent output) while the rewrite is
    // running, and a handle captured at open then writes into a dead
    // component. The text never changes on screen, which reads as "the
    // rewrite never succeeded" even though the daemon finished.
    const deliverToComposer = useCallback(
      (rewritten: string) => {
        if (settings.status !== "ready") return;
        let lookup = composerRef.current;
        if (mounted.current && agentId !== null) {
          const fresh = locate(probeRef.current, agentId);
          if (fresh.ok) {
            composerRef.current = fresh;
            lookup = fresh;
          }
        }
        if (!lookup?.ok) return;
        if (lookup.handle.getText() !== expected.current) return; // the user's edit wins
        const composed = composeDelivery(
          rewritten,
          original.current,
          settings.values.composerIncludeOriginal,
          t("sheet.originalMarker"),
        );
        lookup.handle.replaceText(composed);
        expected.current = composed;
        if (agentId !== null) deliveryRecords.set(agentId, { composed, rewritten, original: original.current });
      },
      [agentId, locate, settings, t],
    );

    const runRewrite = useCallback(
      async (source: string, actionId: string) => {
        if (settings.status === "ready") applyUiLanguage(settings.values.uiLanguage);
        if (settings.status !== "ready") {
          toast.error(settings.status === "loading" ? t("error.settingsLoading") : settings.error);
          return;
        }
        if (source.trim() === "") {
          toast.error(t("error.writePrompt"));
          return;
        }
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy("rewriting");
        // Identity attach: the same text and action are already in flight —
        // reuse that run's requestId and let the poll deliver the verdict; no
        // duplicate daemon rewrite is fired. A different text or action starts
        // its own run: the registry slot is replaced, and the superseded run's
        // result stays out of this sheet because every delivery guard compares
        // against this sheet's expectation.
        const running = agentId !== null ? inFlightByAgent.get(agentId) : undefined;
        const reuse = running !== undefined && running.source === source && running.actionId === actionId;
        const requestId = reuse ? running.requestId : newRequestId();
        if (agentId !== null && !reuse) inFlightByAgent.set(agentId, { requestId, source, actionId });
        let timer: ReturnType<typeof setTimeout> | undefined;
        let stopPoll: (() => void) | undefined;
        try {
          // Fast path: the response rides the asking client's own connection.
          // A reused run does not fire it again; only the poll can settle it.
          const fromRpc = reuse
            ? null
            : rewrite({
                requestId,
                actionId,
                agentId,
                workspaceId,
                originalPrompt: source,
                settings: promptKitSettingsSchema.parse(settings.values),
              }).then((output) => {
                if (output.status === "error")
                  throw new Error(localizedRewriteError(output.error.code, output.error.message, settings.values.timeoutMs));
                return output.rewrittenPrompt;
              });
          if (fromRpc !== null) fromRpc.catch(() => undefined);
          // Fallback: the response can be lost on the way back (a phone
          // behind a relay that drops mid-rewrite never settles the promise).
          // The daemon keeps the verdict keyed to this run's requestId and the
          // poll reads exactly that run — a verdict from any other run (another
          // surface or device rewriting the same agent) reads as pending.
          const fromPoll = new Promise<string>((resolve, reject) => {
            if (agentId === null) return; // No agent: the rewrite RPC fails on its own with that reason.
            let stopped = false;
            let tick: ReturnType<typeof setTimeout> | undefined;
            const step = async () => {
              if (stopped) return;
              try {
                const verdict = await rewriteResult({ agentId, requestId });
                if (stopped) return;
                if (verdict.status === "pending" || verdict.requestId !== requestId) {
                  tick = setTimeout(step, 2_000);
                  return;
                }
                if (verdict.status === "ok") {
                  resolve(verdict.rewrittenPrompt);
                  return;
                }
                reject(new Error(localizedRewriteError(verdict.error.code, verdict.error.message, settings.values.timeoutMs)));
                return;
              } catch {
                // Relay hiccup: the next tick retries.
              }
              tick = setTimeout(step, 2_000);
            };
            void step();
            stopPoll = () => {
              stopped = true;
              clearTimeout(tick);
            };
          });
          fromPoll.catch(() => undefined);
          const budget = new Promise<never>((_, rejectBudget) => {
            timer = setTimeout(
              () =>
                rejectBudget(
                  new Error(
                    t("error.timeout", {
                      seconds: String(Math.round(effectiveTimeoutMs(settings.values.timeoutMs) / 1000)),
                    }),
                  ),
                ),
              effectiveTimeoutMs(settings.values.timeoutMs) + 5_000,
            );
          });
          budget.catch(() => undefined);
          // Whoever settles first wins; the losers are swallowed right after
          // the race so a late rejection or resolution never surfaces twice.
          const rewritten = await Promise.race([fromRpc ?? new Promise<string>(() => {}), fromPoll, budget]);
          fromRpc?.catch(() => undefined);
          fromPoll.catch(() => undefined);
          finishRun(agentId, requestId, rewritten);
          if (mounted.current) remember(rewritten);
          deliverToComposer(rewritten);
        } catch (error) {
          finishRun(agentId, requestId);
          const failure = error instanceof Error ? error : new Error(String(error));
          toast.error(failure.message);
        } finally {
          clearTimeout(timer);
          stopPoll?.();
          inFlight.current = false;
          if (mounted.current) setBusy("idle");
        }
      },
      [agentId, deliverToComposer, remember, rewriteResult, rewrite, settings, toast, workspaceId],
    );

    /** Registry bookkeeping with ownership: only this run's entry is removed
     *  and only this run's result becomes the resume draft — a newer run for
     *  the same agent (edited text, other action) supersedes both. */
    function finishRun(agentId: string | null, requestId: string, rewritten?: string): void {
      if (agentId === null) return;
      const current = inFlightByAgent.get(agentId);
      if (current !== undefined && current.requestId !== requestId) return; // superseded
      inFlightByAgent.delete(agentId);
      if (rewritten !== undefined) drafts.set(agentId, rewritten);
    }

    // Read the enabled actions once settings are ready.
    const customActions = settings.status === "ready" ? settings.values.customActions : null;
    useEffect(() => {
      if (settings.status !== "ready" || choices !== null) return;
      const values = settings.values;
      listActions({ customActions: values.customActions, actionOverrides: values.actionOverrides })
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
      const record = deliveryRecords.get(agentId);
      if (record !== undefined && composerText === record.composed) {
        // Reopening on exactly what PromptKit delivered: the field resumes
        // from the rewrite itself (so Send sends the rewritten text), the
        // Composer is treated as already delivered, and the auto-rewrite
        // below stays off — rewriting the delivery again is content drift.
        expected.current = record.composed;
        original.current = record.original;
        remember(record.rewritten);
      } else {
        expected.current = composerText;
        original.current = composerText;
        remember(composerText.trim() !== "" ? composerText : (drafts.get(agentId) ?? ""));
      }
      if (!lookup.ok) setNote(describeLookupFailure(lookup.reason));
      else if (choices.length === 0) setNote(t("error.noActions"));
      if (
        lookup.ok &&
        composerText.trim() !== "" &&
        composerText !== record?.composed &&
        choices.length === 1
      )
        void runRewrite(composerText, choices[0]!.id);
    }, [agentId, choices, remember, runRewrite]);

    const send = useCallback(async () => {
      if (inFlight.current || busy !== "idle" || agentId === null || value.trim() === "") return;
      inFlight.current = true;
      setBusy("sending");
      try {
        await paseo.agents.ref(agentId).send(value);
        // Clear the Composer only when it still holds text this sheet wrote or
        // found there: the value just sent, the delivered composition, or the
        // open-time text. Anything else is the user's own edit — keep it.
        let lookup = composerRef.current;
        if (mounted.current) {
          const fresh = locate(probeRef.current, agentId);
          if (fresh.ok) {
            composerRef.current = fresh;
            lookup = fresh;
          }
        }
        const text = lookup?.ok ? lookup.handle.getText() : null;
        const delivered = deliveryRecords.get(agentId);
        const mine = text !== null && (text === value || text === expected.current || text === delivered?.composed);
        if (lookup?.ok && mine) lookup.handle.replaceText("");
        if (mine) {
          deliveryRecords.delete(agentId);
          expected.current = "";
        }
        remember("");
        close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy("idle");
      }
    }, [agentId, busy, close, locate, paseo, remember, toast, value]);

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
          placeholder={several ? t("sheet.placeholder.multi") : t("sheet.placeholder.single")}
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
            ? t("sheet.rewriting")
            : (note ??
              (several ? t("sheet.note.multi") : t("sheet.note.rewrite")))}
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
              label={busy === "rewriting" ? t("sheet.rewriting") : t("sheet.rewrite")}
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
            label={busy === "sending" ? t("sheet.sending") : t("sheet.send")}
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
