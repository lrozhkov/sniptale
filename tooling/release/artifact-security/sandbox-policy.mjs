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
