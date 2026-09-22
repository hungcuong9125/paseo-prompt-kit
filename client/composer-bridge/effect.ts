import { COMPOSER_ROOT_SELECTOR } from "./dom.js";

const STYLE_ID = "prompt-kit-effect";
const DIM_OPACITY = "0.45";
const FADE_MS = 220;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@keyframes prompt-kit-sweep { from { transform: translateX(-140%) skewX(-20deg); } to { transform: translateX(340%) skewX(-20deg); } }
.prompt-kit-overlay { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: inherit; }
.prompt-kit-beam { position: absolute; top: -10%; bottom: -10%; left: 0; width: 40%;
  background: linear-gradient(90deg, transparent, var(--prompt-kit-beam, rgba(255,255,255,0.18)), transparent);
  animation: prompt-kit-sweep 1.1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .prompt-kit-beam { animation: none; display: none; } }
`;
  doc.head.appendChild(style);
}

/** Beam color from the background behind the field: light on dark surfaces, dark on light ones. */
function beamColor(element: HTMLElement | null): string {
  const view = element?.ownerDocument.defaultView;
  for (let node = element; node && view; node = node.parentElement) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(view.getComputedStyle(node).backgroundColor);
    if (!match || (match[4] !== undefined && Number(match[4]) === 0)) continue;
    const luminance = (0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3])) / 255;
    return luminance > 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  }
  return "rgba(128,128,128,0.18)";
}

/** Dims the field and sweeps a slanted light across its Composer until `stop` is called. */
export function startRewriteEffect(field: HTMLTextAreaElement): () => void {
  const doc = field.ownerDocument;
  ensureStyles(doc);
  const root = field.closest<HTMLElement>(COMPOSER_ROOT_SELECTOR) ?? field.parentElement;
  const previousTransition = field.style.transition;
  const previousOpacity = field.style.opacity;
  field.style.transition = `opacity ${FADE_MS}ms ease`;
  field.style.opacity = DIM_OPACITY;

  const overlay = doc.createElement("div");
  overlay.className = "prompt-kit-overlay";
  overlay.setAttribute("data-prompt-kit-effect", "");
  overlay.style.setProperty("--prompt-kit-beam", beamColor(root));
  const beam = doc.createElement("div");
  beam.className = "prompt-kit-beam";
  overlay.appendChild(beam);
  root?.appendChild(overlay);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    overlay.remove();
    field.style.opacity = previousOpacity || "1";
    setTimeout(() => {
      field.style.transition = previousTransition;
      if (previousOpacity === "") field.style.removeProperty("opacity");
    }, FADE_MS + 40);
  };
}
