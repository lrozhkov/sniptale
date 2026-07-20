/**
 * Owns browser-history mutation for one-shot camera recorder launch tokens.
 */
export function clearCameraRecorderLaunchUrlParams(): void {
  window.history.replaceState({}, '', window.location.pathname);
}
