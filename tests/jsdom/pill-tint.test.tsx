import { describe, expect, it } from "vitest";
import { PILL_TINTS, watchPillTint } from "../../client/pills/pill-tint.js";

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function pill(label: string) {
  const button = document.createElement("div");
  button.setAttribute("role", "button");
  button.innerHTML = `<div><svg stroke="#aaa"><path d="M0 0"/></svg></div><div dir="auto">${label}</div>`;
  document.body.appendChild(button);
  return button;
}

describe("pill tint", () => {
  it("paints border, label and icon by label, and clears when the label returns to idle", async () => {
    const stop = watchPillTint(document);
    const button = pill("PromptKit");
    const text = button.querySelector<HTMLElement>("[dir]")!;
    const icon = button.querySelector("svg")!;

    text.textContent = "Rewriting...";
    await frame();
    const purple = PILL_TINTS["Rewriting..."]!;
    expect([button.style.borderColor, text.style.color, icon.style.stroke].every((c) => c !== "")).toBe(true);
    expect(button.style.borderColor).toBe(text.style.color);
    const painted = button.style.borderColor;

    text.textContent = "Rewritten";
    await frame();
    expect(button.style.borderColor).not.toBe(painted);
    expect(PILL_TINTS.Rewritten).not.toBe(purple);

    text.textContent = "PromptKit";
    await frame();
    expect([button.style.borderColor, text.style.color, icon.style.stroke]).toEqual(["", "", ""]);
    stop();
    button.remove();
  });
});
