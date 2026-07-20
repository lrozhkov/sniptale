import { expect, it } from 'vitest';
import { DEFAULT_BROWSER_FRAME_STATE } from '../../../../features/editor/document/constants';
import { renderExactBrowserFrameToDataUrl } from './renderer';

it('renders the exact preset as an svg data url without a DOM host', async () => {
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      faviconDataUrl: 'data:image/png;base64,favicon',
      title: 'Exact proof',
      url: 'https://sniptale.app',
    },
    headerHeight: 88,
    height: 808,
    radius: 12,
    width: 1180,
  });

  expect(dataUrl.startsWith('data:image/svg+xml')).toBe(true);
  expect(decodeURIComponent(dataUrl)).toContain('data:image/png;base64,favicon');
});

it('renders wide browser headers without falling back to symbol/use slice clones', async () => {
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      title: 'Wide exact proof',
      url: 'https://sniptale.app/wide-proof',
    },
    headerHeight: 86,
    height: 86,
    radius: 0,
    width: 1920,
  });
  const svg = decodeURIComponent(dataUrl);
  const svgMarkup = svg.slice(svg.indexOf(',') + 1);

  expect(svg).toContain('id="tab-title"');
  expect(svg).toContain('id="address-url"');
  expect(svg).toContain('viewBox="527 0 267 86"');
  expect(svg).not.toContain('<symbol id="browser-header-template"');
  expect(svg).not.toContain('href="#browser-header-template"');
  expect(svgMarkup).not.toContain('data:image/svg+xml;charset=utf-8,');
});

it('omits the favicon layer when the browser-frame draft has no favicon payload', async () => {
  const dataUrl = await renderExactBrowserFrameToDataUrl({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      title: 'Exact proof',
      url: 'https://sniptale.app',
    },
    headerHeight: 88,
    height: 808,
    radius: 12,
    width: 1180,
  });

  expect(decodeURIComponent(dataUrl)).not.toContain('data:image/png;base64,favicon');
});
