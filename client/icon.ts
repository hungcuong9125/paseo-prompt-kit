/**
 * The icon this plugin presents itself with.
 *
 * Both the settings screen title and the Composer pill read it. They used to be
 * written out separately, and the pill then overrode its own with the first
 * action's icon, so the pill showed `Code2` while the settings header showed
 * `Sparkles` for the same plugin. One constant, read by both, is what keeps them
 * from drifting again.
 *
 * The host resolves the name through Lucide, so a name that is not a Lucide icon
 * renders as nothing rather than failing.
 */
export const PLUGIN_ICON = "Sparkles";
