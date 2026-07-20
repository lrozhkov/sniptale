import { describe, expect, it, vi } from 'vitest';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn(() => 'New tab'),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: translateMock,
}));

import { resolveExactBrowserFrameTitleText, resolveExactBrowserFrameUrlText } from './text';

describe('browser-frame-factory exact text', () => {
  it('falls back to the translated title when the tab title is blank', () => {
    expect(resolveExactBrowserFrameTitleText(240, '   ')).toBe('New tab');
  });

  it('resolves the blank tab title through the translator at render time', () => {
    translateMock.mockReturnValueOnce('Новая вкладка');

    expect(resolveExactBrowserFrameTitleText(240, '')).toBe('Новая вкладка');
  });

  it('escapes and truncates explicit title content', () => {
    const value = resolveExactBrowserFrameTitleText(90, 'AT&T <Docs> browser frame visual proof');

    expect(value).toContain('AT&amp;T');
    expect(value).toContain('&lt;Docs&gt;');
    expect(value).toContain('…');
  });

  it('falls back to example.com when the URL field is blank', () => {
    expect(resolveExactBrowserFrameUrlText(240, '   ')).toBe('example.com');
  });

  it('preserves the explicit URL exactly as entered', () => {
    expect(resolveExactBrowserFrameUrlText(240, 'https://sniptale.app/browser-frame-proof')).toBe(
      'https://sniptale.app/browser-frame-proof'
    );
  });

  it('escapes URL text without truncating query parameters', () => {
    expect(resolveExactBrowserFrameUrlText(32, 'https://sniptale.app/path?a=1&b=<docs>')).toBe(
      'https://sniptale.app/path?a=1&amp;b=&lt;docs&gt;'
    );
  });
});
