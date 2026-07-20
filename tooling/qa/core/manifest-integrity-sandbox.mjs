export const EXPECTED_SANDBOX_CSP = [
  'sandbox allow-scripts;',
  "default-src 'none';",
  "script-src 'self';",
  "style-src 'self';",
  "connect-src 'none';",
  'worker-src blob:;',
  "child-src 'none';",
  "object-src 'none';",
].join(' ');

export const EXPECTED_SANDBOX_PAGES = ['apps/extension/src/effect-runtime-sandbox/index.html'];

export function collectSandboxEntries(manifest) {
  return (manifest.sandbox?.pages ?? []).map((path) => ({ path, label: 'sandbox.pages' }));
}

export function collectEffectRuntimeSandboxViolations(manifest, manifestFile, createViolation) {
  return [
    ...collectSandboxPageViolations(manifest, manifestFile, createViolation),
    ...collectSandboxCspViolations(manifest, manifestFile, createViolation),
  ];
}

function collectSandboxPageViolations(manifest, manifestFile, createViolation) {
  const pages = manifest.sandbox?.pages;
  return !Array.isArray(pages) ||
    pages.length !== EXPECTED_SANDBOX_PAGES.length ||
    pages.some((page, index) => page !== EXPECTED_SANDBOX_PAGES[index])
    ? [
        createViolation(
          manifestFile,
          `sandbox.pages must be ${JSON.stringify(EXPECTED_SANDBOX_PAGES)}.`
        ),
      ]
    : [];
}

function collectSandboxCspViolations(manifest, manifestFile, createViolation) {
  return manifest.content_security_policy?.sandbox !== EXPECTED_SANDBOX_CSP
    ? [
        createViolation(
          manifestFile,
          `content_security_policy.sandbox must be ${JSON.stringify(EXPECTED_SANDBOX_CSP)}.`
        ),
      ]
    : [];
}
