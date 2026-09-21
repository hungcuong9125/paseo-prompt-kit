const PREFIX = "[prompt-kit]";

/**
 * Plugin stdout is captured by the daemon and shown by `paseo plugin logs`.
 * Only non-content fields are logged: prompts and rewritten text never reach it.
 */
export const pluginLog = {
  info(fields: Record<string, string | number | null>, message: string): void {
    console.log(`${PREFIX} ${message} ${format(fields)}`);
  },
  error(fields: Record<string, string | number | null>, message: string): void {
    console.error(`${PREFIX} ${message} ${format(fields)}`);
  },
};

function format(fields: Record<string, string | number | null>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${value === null ? "-" : String(value)}`)
    .join(" ");
}
