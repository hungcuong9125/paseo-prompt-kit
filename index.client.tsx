import type { PluginClientContext } from "@getpaseo/plugin/client";

// The Composer button, action menu, and settings screen are pk-UkLWZ.2. This
// entry exists now so the client runtime boundary is exercised by the build.
export default function contribute(_client: PluginClientContext) {
  return () => {};
}
