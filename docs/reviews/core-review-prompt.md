# Review Prompt — PromptKit Core Change Proposal

> Gửi nguyên văn mục "PROMPT" bên dưới cho team review. Mục "Ngữ cảnh gửi kèm" là những gì phải đính kèm theo, không phải nội dung prompt.
> Base để review: `6e6a5e81c77fc184713bc1d3ba5e3825492bcc75` (tree `d93dd8ac5528181f5cc427975db068a6b7d0937d`).

---

## Ngữ cảnh gửi kèm

Đính kèm **bằng đường dẫn** (không dán nội dung):

| Tài liệu | Vì sao cần |
|---|---|
| `docs/CORE.md` | Đối tượng review |
| `AGENTS.md` | Luật kiến trúc: single live contract, hard cut, module boundaries |
| `framework/module-boundaries.md` | Bài kiểm tra "một file một trách nhiệm" |
| `framework/briefs/review.md` | Hợp đồng review của repo này |
| `docs/IMPELEMENT_PLAN.md` | Định hướng gốc (Action Registry) — lưu ý file này bị gitignore |
| `shared/actions.ts`, `shared/rpc.ts`, `shared/prompts/coding.ts`, `client/pills/agent-pills.ts`, `index.server.ts`, `server/rewrite.ts` | Hiện trạng bị thay đổi |
| `docs/decision-log.md` | DLF-003, DLF-005, DLF-006, DLF-011 |
| `docs/DEFERRED.md` | DEF-001, DEF-002, DEF-006, DEF-007 |
| `docs/exec-plans/active/paseo-prompt-kit-post-release-composer-bug.md` | Việc đang mở, phải tách khỏi bản này |

---

## PROMPT

```text
Task:            Independent architecture review — PromptKit Core change proposal
Disposition:     review (read-only)
Base:            6e6a5e81c77fc184713bc1d3ba5e3825492bcc75 (tree d93dd8ac5528181f5cc427975db068a6b7d0937d)
Input:           docs/CORE.md
Write scope:     NONE
Verdict:         PASS | FINDINGS | BLOCKED | REOPEN_REQUEST

## What you are reviewing

`docs/CORE.md` proposes turning PromptKit from a plugin with a compile-time
action list into a Core + declarative Action Pack framework. It is a DRAFT:
no DLF, no packet, no dispatch, no code change. Your job is to attack the
proposal and the questions it leaves open, not to implement it.

## Ground rules

- Read-only. Do not edit any file, do not create a candidate, do not commit.
  Never route around a denial with a shell write.
- Judge the proposal against the repository's own laws: AGENTS.md (exactly one
  live contract; hard cut, no dual-read/shim/legacy parser; fail fast and fail
  closed), framework/module-boundaries.md (one file, one responsibility stated
  in a sentence without "and"), and framework/briefs/review.md (cluster findings
  by root mechanism; report the minimal correction, not a rewrite).
- Argue from artifacts and code in the repository, not from preference. Cite
  file:line. If you assert something about Paseo's host or SDK, cite where you
  read it; the vendored snapshot under upstreams/paseo is 0.9.0-beta.2 while the
  installed SDK is 0.8.0, and that difference matters.
- Distinguish observed fact from document claim from your own inference, and
  label which is which.
- Do not accept the proposal's framing. If the whole direction is wrong, say so.

## Required review targets

1. Boundary correctness. Section 3 states Core's and Pack's responsibility in
   one sentence each. Is that split actually clean, or does the proposed Core
   sentence hide more than one responsibility? Does any proposed module in the
   table own something that belongs to another?

2. The open questions OQ-1..OQ-8. For each: is it genuinely open, or does an
   existing repository decision already answer it? Does the proposal leave a
   material decision to the implementer (which docs/PLANS.md forbids)? Name the
   questions that are decided wrongly, and the ones that must be answered by the
   Human rather than by the team.

3. Hard cut completeness. Section 10 lists what gets deleted. Walk
   shared/actions.ts, shared/rpc.ts, shared/prompts/coding.ts, index.server.ts,
   client/pills/agent-pills.ts, client/pills/rewrite-runner.ts and
   tests/** and report: (a) identifiers that would be orphaned but are not
   listed; (b) current tests whose premise is the compile-time registry and
   which therefore cannot survive as authored truth; (c) any place the proposal
   accidentally reintroduces dual-read, a shim, or a version branch.

4. Security. Section 5.3 and 9 claim declarative packs do not raise the
   execution surface. Test that claim. Specifically: path traversal and symlink
   handling in manifest-relative prompt paths; whether a pack can influence
   anything outside its own action; whether the strict-schema rule is enough;
   and whether moving the coding prompt out of TypeScript into data changes the
   prompt-injection boundary closed by DLF-006 (see OQ-6). Report a concrete
   bypass if one exists, otherwise report why the claim holds.

5. Evidence quality. Section 11 lists acceptance claims. Which of them are
   claim-shaped and falsifiable, and which are ceremony ("changed files",
   "tests exist")? Which claim cannot be verified on a machine without a real
   Paseo host, and what is the smallest honest substitute?

6. Release split. Section 13 orders v0.1.1 (Composer bugfix) before v0.2.0
   (Core). Is that order actually required by the code, or is it only a
   preference? Name the dependency if one exists.

7. `requirements.paseo: ">=0.8.0"` (section 9). The proposal says the range is
   too wide for a plugin that binds to private DOM. Verify that claim against
   upstreams/paseo/packages/protocol/src/plugin-requirements.ts and say what the
   honest range is, and what breaks for a user on 0.9.0-beta.2 today.

## Deliverable

Write your review to:
  docs/reviews/core-review-<your-seat-or-handle>-<YYYYMMDD>.md

Structure it as:

  - Verdict: exactly one of PASS | FINDINGS | BLOCKED | REOPEN_REQUEST
  - Findings, clustered by root mechanism. Each finding: the claim it attacks
    (file:line or CORE.md section), the observed evidence, the minimal
    correction. One root cause = one finding, however many symptoms.
  - OQ rulings: for each of OQ-1..OQ-8, state DECIDED (with the existing
    decision you found) or OPEN (with the decision owner and what it blocks).
  - UNKNOWNs you could not resolve from the repository, and what would resolve
    them.
  - The single next action you would take.

Return PEER_HAND_BACK as your final message with: reviewed base SHA, verdict,
artifact path, root mechanism, minimal correction, remaining UNKNOWNs.
```

---

## Ghi chú cho người gửi

- Prompt **không** nêu trước kết luận. Nếu bạn muốn team phản biện mạnh hơn, giữ nguyên như trên.
- Nếu team review là người/agent không nằm trong repo này, bỏ dòng `PEER_HAND_BACK` và thay bằng yêu cầu trả kết quả trong chat.
- Bug Composer đang mở là packet riêng; nhấn mạnh reviewer **không** được gộp nó vào review CORE.
