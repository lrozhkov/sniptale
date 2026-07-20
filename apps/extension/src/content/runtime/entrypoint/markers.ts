export const CONTENT_RUNTIME_HOST_ID = 'sniptale-extension-root';
export const CONTENT_RUNTIME_MARKER_ATTRIBUTE = 'data-sniptale-content-runtime';
export const CONTENT_RUNTIME_CLEANUP_KEY = '__sniptaleContentRuntimeCleanup';

function getContentRuntimeHost(): HTMLElement | null {
  return document.getElementById(CONTENT_RUNTIME_HOST_ID);
}

export function isFullContentRuntimeMounted(): boolean {
  return getContentRuntimeHost()?.hasAttribute(CONTENT_RUNTIME_MARKER_ATTRIBUTE) === true;
}
