import type { RewriteError } from "../shared/rpc.js";
import { findMissingProtectedLiterals } from "../shared/protected-literals.js";

export type OutputValidation =
  | { ok: true; text: string }
  | { ok: false; error: RewriteError };

/** Plan §19: a rewrite far longer than the request is a specification, not a rewrite. */
const MAX_OUTPUT_CHARS = 20_000;

const FENCE = /```/g;

/**
 * Only unambiguous meta openers. A rewritten prompt may legitimately start with
 * "This is broken" or "Output the result", so the vocabulary stays narrow.
 */
const META_PREFACE =
  /^(?:sure[,!.:]|certainly[,!.:]|of course[,!.:]|here(?:'s| is) (?:the |your )?(?:rewritten|improved|enhanced|optimized|revised) (?:prompt|version)|below is (?:the |your )?(?:rewritten|improved|enhanced|optimized|revised) (?:prompt|version)|the (?:rewritten|improved|enhanced|optimized|revised) (?:prompt|version) is[:.]?$|rewritten prompt:|improved prompt:)/i;

const REFUSAL =
  /^(?:i (?:cannot|can't|won't|will not|am unable|am not able)|i'm sorry|sorry[,.]|as an ai|unfortunately)/i;

/**
 * Output that talks about the prompt instead of rewriting it. An injection prompt is
 * exactly the case where a model is tempted to answer with this commentary rather than
 * the rewrite, so the first line is checked against the meta shapes.
 */
const COMMENTARY =
  /^(?:this (?:prompt|input|request|message) (?:is|looks like|appears to be|contains)|the (?:text|prompt|input|message) (?:below|above) (?:is|contains)|treat (?:this|it) as (?:untrusted|data)|it (?:is|looks like|appears to be) (?:a )?(?:prompt[- ]?injection|injection attempt)|(?:the )?(?:prompt|input)[- ]injection (?:attempt|detected)|i (?:notice|see|detect)|not a legitimate coding task|no action (?:is|was) taken)/i;

function countFences(text: string): number {
  return (text.match(FENCE) ?? []).length;
}

/** True when the whole answer is one fenced block, the wrapper the prompt forbids. */
function isFullMarkdownEnvelope(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("```") && trimmed.endsWith("```") && countFences(trimmed) === 2;
}

function nonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function fail(code: RewriteError["code"], message: string): OutputValidation {
  return { ok: false, error: { code, message } };
}

/**
 * Accepts only text that is the rewritten prompt itself: non-empty, fence-balanced,
 * free of preface/envelope/refusal, and carrying every protected literal of the
 * original. A rejected output never becomes a replacement text.
 */
export function validateRewriteOutput(input: {
  originalPrompt: string;
  output: string;
}): OutputValidation {
  const text = input.output.trim();
  if (text === "") {
    return fail("empty_output", "The rewrite agent returned empty output.");
  }
  if (text.length > MAX_OUTPUT_CHARS) {
    return fail(
      "generation_failed",
      `The rewrite agent returned ${text.length} characters, over the ${MAX_OUTPUT_CHARS} character limit.`,
    );
  }
  if (countFences(text) % 2 !== 0) {
    return fail("generation_failed", "The rewrite output contains an unclosed code fence.");
  }
  if (isFullMarkdownEnvelope(text) && !isFullMarkdownEnvelope(input.originalPrompt)) {
    return fail("generation_failed", "The rewrite output is wrapped in a markdown code fence.");
  }

  const lines = nonEmptyLines(text);
  const first = lines[0];
  if (
    first !== undefined &&
    META_PREFACE.test(first) &&
    !input.originalPrompt.includes(first)
  ) {
    return fail("generation_failed", "The rewrite output starts with a preface, not the prompt.");
  }
  // A refusal is the whole answer: short, one or two lines, and not the user's text.
  if (
    first !== undefined &&
    REFUSAL.test(first) &&
    lines.length <= 2 &&
    wordCount(text) <= 12 &&
    !input.originalPrompt.includes(first)
  ) {
    return fail("generation_failed", "The rewrite agent refused to rewrite the prompt.");
  }
  // Commentary about the prompt is not the rewritten prompt, however long it is.
  if (
    first !== undefined &&
    COMMENTARY.test(first) &&
    !input.originalPrompt.includes(first)
  ) {
    return fail(
      "generation_failed",
      "The rewrite output comments on the prompt instead of rewriting it.",
    );
  }

  const missing = findMissingProtectedLiterals(input.originalPrompt, text);
  if (missing.length > 0) {
    return fail(
      "protected_literal_loss",
      `The rewrite dropped ${missing.length} protected literal(s): ${missing
        .slice(0, 5)
        .map((literal) => literal.value)
        .join(", ")}`,
    );
  }
  return { ok: true, text };
}
