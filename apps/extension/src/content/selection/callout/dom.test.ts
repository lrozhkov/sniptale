// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

describe('callout dom helpers', () => {
  it('fails closed when the shared sanitizer throws', async () => {
    vi.resetModules();
    vi.doMock('@sniptale/platform/security/sanitizers/html', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@sniptale/platform/security/sanitizers/html')>()),
      sanitizeHtmlFragment: () => {
        throw new Error('sanitize failed');
      },
    }));

    const { sanitizeCalloutHtml: sanitizeWithFailure } = await import('./dom');
    expect(sanitizeWithFailure('<div>example</div>')).toBe('');
    vi.doUnmock('@sniptale/platform/security/sanitizers/html');
    vi.resetModules();
  });

  it('preserves plain text content', async () => {
    vi.resetModules();
    const { sanitizeCalloutHtml } = await import('./dom');
    expect(sanitizeCalloutHtml('example')).toBe('example');
  });

  it('keeps supported formatting and strips unsafe attributes', async () => {
    vi.resetModules();
    const { sanitizeCalloutHtml } = await import('./dom');
    expect(
      sanitizeCalloutHtml('<strong onclick="alert(1)">bold</strong><script>bad()</script>')
    ).toBe('<strong>bold</strong>');
  });
});
