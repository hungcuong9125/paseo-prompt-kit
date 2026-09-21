/**
 * Platform-neutral Composer surface. The rest of the plugin never sees a DOM
 * selector; only `client/composer/web.ts` implements this.
 */
export interface ComposerAdapter {
  isSupported(): boolean;
  readText(): string | null;
  replaceText(next: string): boolean;
  focus(): void;
}
