const PREFIX = "[prompt-kit]";

export type LogFields = Record<string, string | number | boolean | null>;

/**
 * Plugin stdout is captured by the daemon and shown by `paseo plugin logs`.
 * Only non-content fields are logged: prompts and rewritten text never reach it.
 */
export const pluginLog = {
  info(fields: LogFields, message: string): void {
    console.log(`${PREFIX} ${message} ${format(fields)}`);
  },
  error(fields: LogFields, message: string): void {
    console.error(`${PREFIX} ${message} ${format(fields)}`);
  },
};

/**
 * Detail lines for one rewrite, written only when the `debugLog` setting is on.
 * They can hold provider and CLI output excerpts, so a debug log is reviewed before it is shared.
 */
export type Trace = (message: string, fields: LogFields | (() => LogFields)) => void;

/** Longest excerpt of provider or CLI output a trace line carries. */
export const TRACE_EXCERPT_CHARS = 2_000;

export const noTrace: Trace = () => undefined;

export function createTrace(enabled: boolean, requestId: string): Trace {
  if (!enabled) return noTrace;
  // A function is evaluated only here, so a disabled trace costs nothing.
  return (message, fields) => {
    const values = typeof fields === "function" ? fields() : fields;
    console.log(`${PREFIX} debug ${message} ${format({ request: requestId, ...values })}`);
  };
}

/** Head and tail of `text` within `max` chars; the tail is where CLIs print the failure. */
export function excerpt(text: string, max = TRACE_EXCERPT_CHARS): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 20) / 2);
  return `${text.slice(0, half)} …[${text.length - 2 * half} chars]… ${text.slice(-half)}`;
}

/** A value with spaces, quotes or `=` is JSON-quoted so each line stays `key=value` parseable. */
function format(fields: LogFields): string {
  return Object.entries(fields)
    .map(([key, value]) => {
      if (value === null) return `${key}=-`;
      const text = String(value);
      return `${key}=${/[\s"=]/.test(text) || text === "" ? JSON.stringify(text) : text}`;
    })
    .join(" ");
}
