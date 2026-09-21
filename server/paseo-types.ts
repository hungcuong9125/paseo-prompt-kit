import type { PluginHandlerContext } from "@getpaseo/plugin/server";

/**
 * The daemon bundles the server entry from a managed checkout that has no
 * `node_modules`; only the host SDK specifiers resolve there, and the client
 * package is not one of them. The Paseo types are therefore derived from the
 * SDK the host passes into a handler, never imported from the client package.
 */
export type PaseoApi = PluginHandlerContext["paseo"];

export type PaseoAgentHandle = Awaited<
  ReturnType<ReturnType<PaseoApi["workspaces"]["ref"]>["agents"]["create"]>
>;
