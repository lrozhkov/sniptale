export const EXPECTED_SANDBOX_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;',
  "default-src 'none';",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';",
  "style-src 'self' 'unsafe-inline';",
  'img-src data:;',
  'font-src data:;',
  'media-src data:;',
  'connect-src data:;',
  'worker-src blob:;',
  'child-src blob:;',
  "object-src 'none';",
].join(' ');
export const EXPECTED_EFFECT_SANDBOX_CSP = [
  "default-src 'none';",
  "script-src 'self' 'wasm-unsafe-eval';",
  "style-src 'self';",
  'connect-src data:;',
  'worker-src blob:;',
  "child-src 'none';",
  "object-src 'none';",
].join(' ');
export const EXPECTED_TOUR_SANDBOX_CSP = [
  "default-src 'none';",
  "script-src 'self' 'unsafe-inline';",
  "style-src 'self' 'unsafe-inline';",
  'img-src data:;',
  'font-src data:;',
  'media-src data:;',
  "connect-src 'none';",
  'worker-src blob:;',
  'child-src blob:;',
  "object-src 'none';",
].join(' ');
export const EXPECTED_SANDBOX_PAGES = [
  'apps/extension/src/effect-runtime-sandbox/index.html',
  'apps/extension/src/tour-preview-sandbox/index.html',
];
