import { describe, expect, it } from "vitest";
import { fiberOf, findComposerHandle } from "../../client/composer-bridge/fiber.js";

interface Node {
  return: Node | null;
  child: Node | null;
  sibling: Node | null;
  memoizedProps: Record<string, unknown> | null;
  ref?: unknown;
}

function node(props: Record<string, unknown> | null, children: Node[] = [], ref?: unknown): Node {
  const self: Node = { return: null, child: null, sibling: null, memoizedProps: props, ref };
  let previous: Node | null = null;
  for (const child of children) {
    child.return = self;
    if (previous === null) self.child = child;
    else previous.sibling = child;
    previous = child;
  }
  return self;
}

const handle = { getText: () => "hello", replaceText: () => {}, focus: () => {}, getInputSnapshot: () => ({}) };
const other = { getText: () => "other", replaceText: () => {}, focus: () => {}, getInputSnapshot: () => ({}) };

describe("findComposerHandle", () => {
  it("finds the agent's Composer input from a probe elsewhere in the tree", () => {
    const probe = node({ testID: "probe" });
    const root = node(null, [
      node({ agentId: "a" }, [node({ value: "" }, [], { current: handle })]),
      node({ agentId: "b" }, [node({ value: "" }, [], { current: other })]),
      node({ sheet: true }, [probe]),
    ]);
    expect(root).toBeTruthy();
    const found = findComposerHandle(probe, "a");
    expect(found.ok).toBe(true);
    if (!found.ok) throw new Error("expected ok");
    expect(found.handle.getText()).toBe("hello");
  });

  it("reads the ref from props when the fiber carries none", () => {
    const probe = node({});
    node(null, [node({ agentId: "a" }, [node({ value: "", ref: { current: handle } })]), probe]);
    expect(findComposerHandle(probe, "a")).toEqual({ ok: true, handle });
  });

  it("fails closed: no fiber, no Composer for the agent, a lesser handle, or two Composers", () => {
    expect(findComposerHandle(null, "a")).toEqual({ ok: false, reason: "no_fiber" });
    const lonely = node({});
    node(null, [node({ agentId: "b" }, [node({}, [], { current: handle })]), lonely]);
    expect(findComposerHandle(lonely, "a")).toEqual({ ok: false, reason: "not_found" });
    // The inner text field's handle lacks getInputSnapshot and must not be taken.
    const inner = node({});
    node(null, [node({ agentId: "a" }, [node({}, [], { current: { getText() {}, replaceText() {}, focus() {} } })]), inner]);
    expect(findComposerHandle(inner, "a")).toEqual({ ok: false, reason: "not_found" });
    const twin = node({});
    node(null, [node({ agentId: "a" }, [node({}, [], { current: handle }), node({}, [], { current: other })]), twin]);
    expect(findComposerHandle(twin, "a")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("reads a fiber only from a Fabric public instance", () => {
    const fiber = node({});
    expect(fiberOf({ __internalInstanceHandle: fiber })).toBe(fiber);
    expect(fiberOf({})).toBeNull();
    expect(fiberOf(null)).toBeNull();
  });
});
