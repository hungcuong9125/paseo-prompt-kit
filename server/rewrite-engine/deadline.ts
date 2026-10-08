/** Owns cancellation across every asynchronous phase of one rewrite. */
export class RewriteDeadline {
  readonly controller = new AbortController();
  readonly expiresAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly parent: AbortSignal | undefined;
  private readonly cancelFromParent = () => this.controller.abort();

  constructor(timeoutMs: number, parent?: AbortSignal) {
    this.expiresAt = Date.now() + timeoutMs;
    this.parent = parent;
    this.timer = setTimeout(() => this.controller.abort(), Math.max(0, timeoutMs));
    parent?.addEventListener("abort", this.cancelFromParent, { once: true });
    if (parent?.aborted) this.controller.abort();
  }

  get signal(): AbortSignal { return this.controller.signal; }
  remaining(): number { return Math.max(0, this.expiresAt - Date.now()); }

  async wait<T>(operation: Promise<T>): Promise<T> {
    if (this.signal.aborted) { void operation.catch(() => {}); throw new Error("Rewrite deadline exceeded."); }
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new Error("Rewrite deadline exceeded."));
      this.signal.addEventListener("abort", abort, { once: true });
      operation.then(resolve, reject).finally(() => this.signal.removeEventListener("abort", abort));
    });
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.parent?.removeEventListener("abort", this.cancelFromParent);
  }
}

export const rewriteTimeout = () => ({
  status: "error" as const,
  error: { code: "timeout" as const, message: "The rewrite exceeded its time budget; your draft was kept." },
});
