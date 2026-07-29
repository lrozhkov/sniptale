// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';

afterEach(() => {
  document.body.replaceChildren();
});

describe('callout dom helpers', () => {
  it('resolves theme ownership only from the explicitly registered content host', async () => {
    vi.resetModules();
    const { initializeContentUiRoots } = await import('../../platform/dom-host');
    const pageLookalike = document.createElement('div');
    pageLookalike.id = CONTENT_ROOT_ID;
    document.body.append(pageLookalike);
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    initializeContentUiRoots(host.attachShadow({ mode: 'open' }));
    const { resolveCalloutThemeOwner } = await import('./dom');

    expect(resolveCalloutThemeOwner()).toBe(host);
    expect(resolveCalloutThemeOwner()).not.toBe(pageLookalike);
  });

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
