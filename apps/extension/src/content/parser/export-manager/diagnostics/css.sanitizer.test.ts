import { expect, it } from 'vitest';

import { sanitizeCssDiagnosticContent, sanitizeCssDiagnosticScalar } from './css.sanitizer';

it('redacts credentials, sensitive query values, embedded bodies, and oversized CSS evidence', () => {
  const sanitized = sanitizeCssDiagnosticScalar(
    [
      '.secret[data-token="private-value"]',
      'url("https://user:password@example.test/icon.svg?token=private-value#glyph")',
      `url("data:image/svg+xml,${'private-body'.repeat(1_000)}")`,
    ].join(' ')
  );

  expect(sanitized).toContain('data-token="***"');
  expect(sanitized).toContain('https://example.test/icon.svg');
  expect(sanitized).toContain('[embedded image/svg+xml]');
  expect(sanitized).not.toContain('private-value');
  expect(sanitized).not.toContain('private-body');
  expect(sanitized.length).toBeLessThan(400);
});

it('keeps icon glyph evidence but summarizes authored pseudo-element text', () => {
  expect(sanitizeCssDiagnosticContent('"\\e001"')).toBe('"\\e001"');
  expect(sanitizeCssDiagnosticContent('"private customer name"')).toBe(
    '[text content redacted: 23 chars]'
  );
});
