import { describe, expect, it } from "vitest";
import { MODEL_FILTER_THRESHOLD, describeFilter, filterModels } from "../../client/settings/model-filter.js";

const OPTIONS = [
  { label: "Llama 3.1 8B", value: "@cf/meta/llama-3.1-8b-instruct-fp8" },
  { label: "Gemini 2.5 Flash-Lite", value: "gemini-2.5-flash-lite" },
  { label: "GPT OSS 120B", value: "openai/gpt-oss-120b" },
];

describe("filterModels", () => {
  it("matches the name or the id, ignoring case and surrounding space", () => {
    expect(filterModels(OPTIONS, "  flash ").map((o) => o.value)).toEqual(["gemini-2.5-flash-lite"]);
    expect(filterModels(OPTIONS, "@CF/META").map((o) => o.value)).toEqual(["@cf/meta/llama-3.1-8b-instruct-fp8"]);
  });

  it("returns everything for an empty query and nothing for a miss", () => {
    expect(filterModels(OPTIONS, "")).toEqual(OPTIONS);
    expect(filterModels(OPTIONS, "whisper")).toEqual([]);
  });

  // The host dropdown shows the saved value only if it is still an option.
  it("keeps the current selection even when it does not match", () => {
    expect(filterModels(OPTIONS, "flash", "openai/gpt-oss-120b").map((o) => o.value)).toEqual([
      "gemini-2.5-flash-lite",
      "openai/gpt-oss-120b",
    ]);
  });
});

describe("describeFilter", () => {
  it("states the total when empty and the match count otherwise", () => {
    expect(describeFilter(31, 31, "")).toContain("31 models");
    expect(describeFilter(31, 4, "glm")).toBe("4 of 31 models match.");
  });

  it("uses a threshold below which no filter row is shown", () => {
    expect(MODEL_FILTER_THRESHOLD).toBeGreaterThan(0);
  });
});
