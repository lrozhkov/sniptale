export const CONTENT_RUNTIME_HOST_ID = 'sniptale-extension-root';
export const CONTENT_RUNTIME_MARKER_ATTRIBUTE = 'data-sniptale-content-runtime';
export const CONTENT_RUNTIME_CLEANUP_KEY = '__sniptaleContentRuntimeCleanup';

function getContentRuntimeHost(): HTMLElement | null {
  return document.getElementById(CONTENT_RUNTIME_HOST_ID);
}

export function isFullContentRuntimeMounted(): boolean {
  return getContentRuntimeHost()?.hasAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE) === true;
}

type GuardedCleanup = (() => void) & { releaseGuard?: () => Promise<boolean> };
type RuntimeGlobal = typeof globalThis & { [CONTENT_RUNTIME_CLEANUP_KEY]?: GuardedCleanup };
function getRegisteredCleanup(): GuardedCleanup | undefined {
  return (globalThis as RuntimeGlobal)[CONTENT_RUNTIME_CLEANUP_KEY];
}

/** Attach the App owner's committed-state decision to the existing cleanup owner. */
export function installContentRuntimeReleaseGuard(guard: () => Promise<boolean>): () => void {
  const cleanup = getRegisteredCleanup();
  if (!cleanup) return () => undefined;
  cleanup.releaseGuard = guard;
  return () => {
    if (cleanup.releaseGuard === guard) delete cleanup.releaseGuard;
  };
}

/** Release only the same runtime whose App owner accepted the request. */
export async function requestFullContentRuntimeRelease(): Promise<boolean> {
  const cleanup = getRegisteredCleanup();
  if (!cleanup?.releaseGuard || !(await cleanup.releaseGuard())) return false;
  if (getRegisteredCleanup() !== cleanup) return false;
  cleanup();
  return true;
}
