// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: vi.fn(() => 'New tab'),
}));

import { EXACT_BROWSER_FRAME_REFERENCE } from './assets';
import { composeExactBrowserFrameSvg } from './compositor';
import { resolveExactBrowserFrameGeometry } from './geometry';
import { createTemplateDefs, createTemplateSlices } from './template-svg';
import { resolveExactBrowserFrameTitleText, resolveExactBrowserFrameUrlText } from './text';

function registerExactGeometryTests() {
  it('keeps geometry and truncation deterministic for the exact preset', () => {
    expect(
      resolveExactBrowserFrameGeometry({
        contentHeight: 720,
        headerHeight: 88,
        radius: 12,
        width: 1180,
      })
    ).toEqual(
      expect.objectContaining({
        bodyTop: 87,
        header: expect.objectContaining({
          leftWidth: expect.closeTo(539.26, 2),
          rightWidth: expect.closeTo(140.19, 2),
        }),
        titleSlot: expect.objectContaining({
          left: expect.closeTo(73.67, 2),
          width: expect.closeTo(190.33, 2),
        }),
        urlSlot: expect.objectContaining({
          left: expect.closeTo(137.12, 2),
          width: expect.closeTo(857.7, 2),
        }),
      })
    );
    expect(
      resolveExactBrowserFrameTitleText(90, 'A very long title that should truncate')
    ).toContain('…');
    expect(resolveExactBrowserFrameUrlText(110, 'https://sniptale.app/browser-frame-proof')).toBe(
      'https://sniptale.app/browser-frame-proof'
    );
  });
}

function registerExactShellMarkupTest() {
  it('builds a deterministic inline-template SVG shell with template-backed text nodes', () => {
    const svg = composeExactBrowserFrameSvg({
      contentHeight: 720,
      faviconDataUrl: 'data:image/png;base64,favicon',
      headerHeight: 88,
      height: 808,
      radius: 12,
      title: 'Pixel-perfect browser header proof',
      url: 'https://sniptale.app/browser-frame-proof',
      width: 1180,
    });
    const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');

    expect(svg).toContain('Pixel-perfect browser hea…');
    expect(svg).toContain('https://sniptale.app/browser-frame-proof');
    expect(svg).toContain('clipPath id="tab-title-clip"');
    expect(svg).toContain('clipPath id="url-clip"');
    expect(svg).toContain('data:image/png;base64,favicon');
    expect(svg).toContain('filter id="shadow"');
    expect(svg).not.toContain('<symbol id="browser-header-template"');
    expect(svg).not.toContain('href="#browser-header-template"');
    expect(documentNode.querySelectorAll('#tab-title')).toHaveLength(1);
    expect(documentNode.querySelectorAll('#address-url')).toHaveLength(1);
    expect(documentNode.querySelector('#tab-title')?.textContent).toContain(
      'Pixel-perfect browser hea…'
    );
    expect(documentNode.querySelector('#address-url')?.textContent).toContain(
      'https://sniptale.app/browser-frame-proof'
    );
  });
}

function registerExactShellEscapingTest() {
  it('escapes title and url text so Fabric can load the inline template SVG', () => {
    const svg = composeExactBrowserFrameSvg({
      contentHeight: 720,
      headerHeight: 88,
      height: 808,
      radius: 12,
      title: 'AT&T <Docs>',
      url: 'https://sniptale.app/browser-frame-proof?a=1&b=2',
      width: 1180,
    });
    const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');

    expect(svg).toContain('AT&amp;T &lt;Docs&gt;');
    expect(documentNode.querySelector('parsererror')).toBeNull();
    expect(svg).not.toContain('AT&T <Docs>');
  });
}

function registerTemplateSliceTest() {
  it('creates namespaced nested svg slice instances from the repo-owned template reference', () => {
    const geometry = resolveExactBrowserFrameGeometry({
      contentHeight: 720,
      headerHeight: EXACT_BROWSER_FRAME_REFERENCE.headerHeight,
      radius: 12,
      width: 1180,
    });

    const defs = createTemplateDefs({
      geometry,
      headerHeight: EXACT_BROWSER_FRAME_REFERENCE.headerHeight,
    });
    const slices = createTemplateSlices({
      geometry,
      headerHeight: EXACT_BROWSER_FRAME_REFERENCE.headerHeight,
    });
    const rootSliceCount = (slices.match(/<svg x="/g) ?? []).length;

    expect(EXACT_BROWSER_FRAME_REFERENCE.templateInnerMarkup).toContain('tab-favicon-placeholder');
    expect(EXACT_BROWSER_FRAME_REFERENCE.templateInnerMarkup).toContain('id="tab-title"');
    expect(EXACT_BROWSER_FRAME_REFERENCE.templateInnerMarkup).toContain('id="address-url"');
    expect(defs).toContain('clipPath id="tab-favicon-clip"');
    expect(rootSliceCount).toBe(3);
    expect(slices).not.toContain('data:image/svg+xml;charset=utf-8,');
    expect(slices).toContain('viewBox="0 0 527 86"');
    expect(slices).toContain('viewBox="527 0 267 86"');
    expect(slices).toContain('viewBox="794 0 137 86"');
    expect(slices).toContain('id="header-left-clip0_4106_1226"');
    expect(slices).toContain('id="header-center-clip0_4106_1226"');
    expect(slices).toContain('id="header-right-clip0_4106_1226"');
    expect(slices).not.toContain('<symbol id="browser-header-template"');
    expect(slices).not.toContain('href="#browser-header-template"');
  });
}

function registerWideWidthCompositionTest() {
  it('keeps wide-width compositions on nested svg slices without regressing to symbol/use', () => {
    const svg = composeExactBrowserFrameSvg({
      contentHeight: 0,
      headerHeight: EXACT_BROWSER_FRAME_REFERENCE.headerHeight,
      height: EXACT_BROWSER_FRAME_REFERENCE.headerHeight,
      radius: 12,
      title: 'Example Domain',
      url: 'example.com',
      width: 1920,
    });
    const documentNode = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const rootSliceCount = (svg.match(/<svg x="/g) ?? []).length;

    expect(rootSliceCount).toBe(3);
    expect(svg).not.toContain('<symbol id="browser-header-template"');
    expect(svg).not.toContain('href="#browser-header-template"');
    expect(svg).not.toContain('data:image/svg+xml;charset=utf-8,');
    expect(documentNode.querySelector('#tab-title')?.textContent).toContain('Example Domain');
    expect(documentNode.querySelector('#address-url')?.textContent).toContain('example.com');
  });
}

function registerHeaderOnlyCompositionTest() {
  it('removes the window content shell for header-only compositions', () => {
    const svg = composeExactBrowserFrameSvg({
      contentHeight: 0,
      headerHeight: 88,
      height: 88,
      radius: 12,
      title: 'Header only proof',
      url: 'https://sniptale.app/browser-frame-proof',
      width: 1180,
    });

    expect(svg).not.toContain('stroke="#d8dde5" rx="12" ry="12"');
    expect(svg).not.toContain('stroke="#eef1f5"');
  });
}

describe('browser-frame-factory exact compositor', () => {
  registerExactGeometryTests();
  registerExactShellMarkupTest();
  registerExactShellEscapingTest();
  registerHeaderOnlyCompositionTest();
  registerTemplateSliceTest();
  registerWideWidthCompositionTest();
});
