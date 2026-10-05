import { describe, expect, it, vi } from 'vitest';
import { EXACT_BROWSER_FRAME_REFERENCE as exactBrowserFrameReference } from './assets';

describe('browser-frame-factory exact assets', () => {
  it('falls back to raw markup when the imported template has no svg root wrapper', async () => {
    vi.resetModules();
    vi.doMock('./template/chrome-default-theme.svg?raw', () => ({
      default: '<g id="no-svg-root"><rect width="10" height="10" /></g>',
    }));

    const { EXACT_BROWSER_FRAME_REFERENCE } = await import('./assets');

    expect(EXACT_BROWSER_FRAME_REFERENCE.templateInnerMarkup).toBe(
      '<g id="no-svg-root"><rect width="10" height="10" /></g>'
    );
    vi.doUnmock('./template/chrome-default-theme.svg?raw');
  });

  it('keeps template-backed text nodes and shell markup separately addressable', async () => {
    expect(exactBrowserFrameReference.tabTitleMarkup).toContain('id="tab-title"');
    expect(exactBrowserFrameReference.urlMarkup).toContain('id="address-url"');
    expect(exactBrowserFrameReference.shellMarkup).not.toContain('id="tab-title"');
    expect(exactBrowserFrameReference.shellMarkup).not.toContain('id="address-url"');
    expect(exactBrowserFrameReference.shellMarkupWithoutFavicon).not.toContain(
      'id="tab-favicon-placeholder"'
    );
  });
});
