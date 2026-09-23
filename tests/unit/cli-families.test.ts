import { describe, expect, it } from "vitest";
import { CLI_FAMILY_IDS, resolveCliFamilyId } from "../../shared/cli-families.js";

/**
 * The shared id rule. The daemon resolves a provider with it before spawning,
 * and the settings screen shows its answer next to each provider, so one rule
 * in one place is what keeps the two from disagreeing.
 */
describe("resolveCliFamilyId", () => {
  it("reads the family from the id itself, its leading segment, or its trailing segment", () => {
    for (const family of CLI_FAMILY_IDS) {
      expect(resolveCliFamilyId(family)).toBe(family);
      expect(resolveCliFamilyId(`${family}-custom`)).toBe(family);
      expect(resolveCliFamilyId(`lead-${family}`)).toBe(family);
    }
  });

  it("tests the longest family first so a longer id is never claimed by a shorter one", () => {
    expect(resolveCliFamilyId("opencode-custom")).toBe("opencode");
  });

  it("prefers an explicit mapping and fails closed on a mapping that names no family", () => {
    expect(resolveCliFamilyId("mystery")).toBeNull();
    expect(resolveCliFamilyId("mystery", { mystery: "codex" })).toBe("codex");
    expect(resolveCliFamilyId("pi-custom", { "pi-custom": "claude" })).toBe("claude");
    expect(resolveCliFamilyId("pi-custom", { "pi-custom": "not-a-family" })).toBeNull();
  });

  it("does not match a family that merely appears inside a word", () => {
    expect(resolveCliFamilyId("pipeline")).toBeNull();
    expect(resolveCliFamilyId("spiral")).toBeNull();
  });
});
