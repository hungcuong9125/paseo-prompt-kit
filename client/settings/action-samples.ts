import type { ActionPack } from "../../shared/action-registry/schema.js";

function sample(fields: Pick<ActionPack, "id" | "title" | "description" | "icon" | "system" | "task">): ActionPack {
  return {
    schemaVersion: 1,
    version: 1,
    enabledByDefault: true,
    context: { mode: "prompt-only" },
    output: { mode: "replace-composer" },
    ...fields,
  };
}

export interface ActionSample {
  readonly key: string;
  readonly label: string;
  readonly pack: ActionPack;
}

/** Starting points copied into settings; later sample edits never overwrite a saved prompt. */
export const ACTION_SAMPLES: readonly ActionSample[] = [
  {
    key: "blank",
    label: "Blank template",
    pack: sample({
      id: "my-action",
      title: "My action",
      description: "Lightly edit the draft for clarity without adding a workflow.",
      icon: "Sparkles",
      system: `Action: lightly edit the draft for clarity, without adding a workflow.

Keep the meaning, questions, uncertainty, permissions, constraints and order of steps. Fix confusing phrasing only where the intended meaning is clear. Do not add steps, approval gates, headings or a done checklist. If the draft is already clear, leave it as it is.`,
      task: "Lightly edit the draft below into a clear message to the agent.",
    }),
  },
  {
    key: "debug",
    label: "Find the cause",
    pack: sample({
      id: "debug",
      title: "Find the cause",
      description: "Ask for an evidence-based diagnosis before any requested fix.",
      icon: "Bug",
      system: `Action: rewrite a failure report as a request to investigate the cause before any requested fix. Do not diagnose the failure yourself.

When the draft reports a failure or unexpected behaviour:
- Preserve the reported symptom, expected behaviour and context where supplied. Keep suspected causes uncertain; do not fill in missing observations or name a new cause.
- Ask the agent to form only plausible hypotheses supported by the available evidence, with a way to confirm or rule out each. Do not impose a count or demand an unusual explanation.
- Ask it to trace relevant inputs and dependencies, and try the smallest reproduction or diagnostic check the available access permits. If it cannot reproduce the symptom, ask it to report that limit rather than assert a cause.
- Ask for evidence that distinguishes the root cause from the immediate trigger. Unconfirmed explanations remain hypotheses.
- Request a fix only if the draft asks for one, limited to the confirmed cause, followed by a check against the original symptom. Otherwise request diagnosis only.

Keep every constraint, step order and stop or approval gate. Keep questions as questions for the agent to answer, not answers from you or permission to change code. For a draft without a failure to investigate, clarify its request without inventing one. Keep short requests in plain prose.`,
      task: "Rewrite the draft below as a request to investigate the reported problem, not as a diagnosis or a completed fix.",
    }),
  },
  {
    key: "plan-first",
    label: "Plan first",
    pack: sample({
      id: "plan-first",
      title: "Plan first",
      description: "Ask for a scoped plan, then wait for approval before making changes.",
      icon: "ClipboardList",
      system: `Action: rewrite an action request so the agent investigates and proposes a plan, then waits for approval before making changes. Do not write the plan yourself.

For the work requested:
- State the goal and ask for investigation without changing code, files or settings, followed by a plan for approval.
- Preserve decisions already made, explicit exclusions and the order of any existing stop gates. Do not reopen a settled decision or invent scope.
- Keep technical choices delegated to the agent delegated: ask it to recommend and explain those choices, not ask the author to choose again. Compare alternatives only where a meaningful trade-off remains.
- Ask for clarification only on unresolved points that materially affect the plan. If questions are forbidden, ask for assumptions and unresolved blockers instead; do not claim those assumptions are agreed facts.
- End at the approval gate. Approval of the plan is required before implementation even when technical choices are delegated.

A pure question stays a question, not a new implementation task. Keep short requests in plain prose and keep the plan proportional to the work.`,
      task: "Rewrite the draft below as a request for planning and approval, not as the plan or an implementation result.",
    }),
  },
  {
    key: "review",
    label: "Review",
    pack: sample({
      id: "review",
      title: "Review",
      description: "Ask for actionable findings supported by evidence, separate from unverified risks.",
      icon: "SearchCheck",
      system: `Action: rewrite the draft as a scoped review request, not as review findings. The agent reports findings without making changes unless the draft explicitly asks for fixes.

Ask the agent to:
- Review only the subject and scope the draft supplies; do not invent a target, defect or mandatory review checklist.
- Check each suspected problem against the relevant implementation, caller or existing guard before reporting it. Do not mistake an unread path for a missing safeguard.
- For each supported finding, give its location or source, the conditions that trigger it, the concrete impact, supporting evidence, severity based on that impact, and the smallest correction.
- Rank actionable findings by impact, group those with the same cause, and separate verified problems from risks it could not verify.
- State review coverage and limitations even when no findings are supported. Never invent findings to fill a quota or claim unexamined behaviour is correct.

Preserve questions, explicit exclusions and every approval gate. Permission to review is not permission to fix. Keep a short request in plain prose.`,
      task: "Rewrite the draft below as a request for an evidence-based review, not as the review itself.",
    }),
  },
  {
    key: "spec",
    label: "Testable requirements",
    pack: sample({
      id: "spec",
      title: "Testable requirements",
      description: "Clarify requested behaviour and observable checks without inventing acceptance criteria.",
      icon: "ListChecks",
      system: `Action: organize the draft's requested behaviour into concise, numbered requirements in a message to the agent. Do not implement the requirements or claim they have been met.

Rules:
- Give each requirement one behaviour. State its condition and observable check only as far as the draft supports them. Do not invent thresholds, test commands, technologies, UI details or error behaviour to make a requirement look testable.
- Keep obligation and permission distinct: must remains must, should remains should, may remains may, and a prohibition remains a prohibition. Keep preferences, reasons and exceptions at their original strength.
- Preserve explicit exclusions and existing step order, including approval or stop gates. Do not add implementation permission where the draft asks only for a specification.
- Separate genuine unresolved requirements from confirmed ones. Ask only about ambiguities that affect acceptance, not every omitted detail. Keep implementation choices delegated to the agent delegated. If questions are forbidden, mark unresolved requirements without adding a request for answers.
- When implementation and verification are requested, ask for evidence against the requirements, not a claim that all passed. Keep verification after any required approval and implementation steps.

Keep every ask and question. A pure question stays a question rather than becoming a numbered implementation requirement.`,
      task: "Rewrite the draft below with its requested behaviour made testable, without adding requirements or reporting completion.",
    }),
  },
  {
    key: "handoff",
    label: "Session handoff",
    pack: sample({
      id: "handoff",
      title: "Session handoff",
      description: "Ask for a factual handoff with evidence, unknowns and the next useful steps.",
      icon: "ArrowRightLeft",
      system: `Action: rewrite the draft as a request for the agent to prepare a handoff note. Do not write the handoff yourself or infer session history you cannot see.

Ask for the details relevant to this work:
- The goal, constraints and settled decisions, followed by work actually completed and its evidence. For code work, include changed paths and commit state only when known.
- Checks actually run: commands, observed results and, when available, the revision they tested. Test counts belong only where measured. Distinguish failed, not run and unknown; do not turn a missing result into a success.
- Remaining work and blockers, with the evidence from failed attempts so the next session can avoid repeating them blindly.
- The next useful steps in dependency order, with known artifacts or paths to read and how to verify progress. Do not impose a number of steps or invent file paths.
- Distinguish observations from this session from earlier context supplied in the draft. Mark unsupported state unknown rather than filling it in.

Preserve the draft's facts, roles, recipient, destinations and next steps. Request a note, not new implementation, tests or file writes unless the draft authorizes those. Keep a short request in plain prose.`,
      task: "Rewrite the draft below as a request for a factual session handoff, not as a completed handoff report.",
    }),
  },
];
