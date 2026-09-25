const TINTED = "data-prompt-kit-tint";

/** Pill label → color. The button contract has no color fields, so the host's DOM is painted. */
export const PILL_TINTS: Readonly<Record<string, string>> = {
  "Rewriting...": "#a78bfa",
  Rewritten: "#22c55e",
};

function paintButton(button: HTMLElement, color: string): void {
  button.setAttribute(TINTED, "");
  if (button.style.borderColor !== color) button.style.borderColor = color;
  for (const node of Array.from(button.querySelectorAll<HTMLElement | SVGElement>("*"))) {
    if (node instanceof SVGElement) {
      if (node.style.stroke !== color) node.style.stroke = color;
    } else if (node.style.color !== color) node.style.color = color;
  }
}

function clearButton(button: HTMLElement): void {
  button.removeAttribute(TINTED);
  button.style.removeProperty("border-color");
  for (const node of Array.from(button.querySelectorAll<HTMLElement | SVGElement>("*"))) {
    node.style.removeProperty("stroke");
    node.style.removeProperty("color");
  }
}

/** Keeps every pill whose label has a tint painted in it, and clears it when the label moves on. */
export function watchPillTint(doc: Document): () => void {
  let frame: number | null = null;
  function paint(): void {
    frame = null;
    for (const button of Array.from(doc.querySelectorAll<HTMLElement>('[role="button"]'))) {
      const color = PILL_TINTS[button.textContent?.trim() ?? ""];
      if (color !== undefined) paintButton(button, color);
      else if (button.hasAttribute(TINTED)) clearButton(button);
    }
  }
  const observer = new MutationObserver(() => {
    frame ??= requestAnimationFrame(paint);
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
