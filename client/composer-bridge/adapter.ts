/**
 * Platform-neutral Composer surface. The rest of the plugin never sees a DOM
 * selector; only `client/composer-bridge/web.ts` implements this.
 */
export interface ComposerAdapter {
  /** False where no DOM exists (native mobile). */
  isSupported(): boolean;
  readText(): string | null;
  replaceText(next: string): boolean;
  focus(): void;
  /** Why `readText` returned null, for the user-facing message. */
  describeFailure(): string;
  /** Visual "rewriting" state on the Composer; returns the function that ends it. */
  beginRewriteEffect(): () => void;
}
