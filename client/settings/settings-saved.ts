/**
 * Tells code outside the React tree that this client saved the settings. The
 * host gives plugins no settings-change event outside `useSettings`, so the
 * Composer pills listen here to follow a Save without a reload.
 */
const listeners = new Set<() => void>();

export function onSettingsSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function announceSettingsSaved(): void {
  for (const listener of [...listeners]) listener();
}
