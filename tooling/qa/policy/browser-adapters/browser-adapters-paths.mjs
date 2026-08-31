export const BROWSER_ADAPTER_ALLOWED_PREFIXES = [
  'apps/extension/src/composition/persistence/infrastructure/browser-storage/',
  'apps/extension/src/platform/runtime-messaging/',
  'packages/platform/src/browser/',
  'packages/platform/src/ports/runtime-messaging/',
  'tooling/test/harness/',
  'tooling/test/support/',
];

const BROWSER_ADAPTER_ALLOWED_FILES = new Set([
  // Playwright must seed and observe the real extension storage mirrors before application code runs.
  'tooling/test/e2e/extension-smoke/extension-smoke.popup-startup.ts',
  // Security E2E retention proof must observe every real browser storage area directly.
  'tooling/test/e2e/support/security-helpers.ts',
]);

export function normalizeBrowserAdapterPath(relativePath) {
  return String(relativePath ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '');
}

export function isBrowserAdapterAllowedPath(relativePath) {
  const normalizedPath = normalizeBrowserAdapterPath(relativePath);
  return (
    !normalizedPath.startsWith('../') &&
    (BROWSER_ADAPTER_ALLOWED_FILES.has(normalizedPath) ||
      BROWSER_ADAPTER_ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)))
  );
}

export function isBrowserAdapterTestLikeFile(relativePath) {
  const normalizedPath = normalizeBrowserAdapterPath(relativePath);
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /\.(?:test|spec)\.(?:fixture|fixtures|helpers|support)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /\.(?:test[.-]helpers|test-support)\.[cm]?[jt]sx?$/u.test(normalizedPath) ||
    /(?:^|\/)(?:test-helpers|test-support)\.[cm]?[jt]sx?$/u.test(normalizedPath)
  );
}
