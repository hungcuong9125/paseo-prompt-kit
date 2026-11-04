import { tNow } from "./core.js";
import { effectiveTimeoutMs } from "../../shared/settings.js";

/**
 * Maps a rewrite failure to the current UI language. Only the fixed verdicts
 * are translated; unknown codes keep the server's message (which may carry
 * detail the client cannot reconstruct).
 */
export function localizedRewriteError(code: string, message: string, timeoutSettingMs: number): string {
  switch (code) {
    case "timeout":
      return tNow("error.timeout", { seconds: String(Math.round(effectiveTimeoutMs(timeoutSettingMs) / 1000)) });
    case "generation_failed":
      return tNow("error.generationFailed");
    case "empty_output":
      return tNow("error.emptyOutput");
    case "spawn_failed":
      return tNow("error.spawnFailed");
    default:
      return message;
  }
}
