// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import {
  IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE,
  IFRAME_RASTER_RECT_ATTRIBUTES,
} from '../page-preparation/snapshot';
import { sanitizePreparedSnapshotDocument } from '../page-preparation/snapshot/sanitizer';
import { materializeUnreadableIframeRasters } from './iframe-raster';
import type { FullPageCaptureGeometry } from '../../../contracts/full-page-capture';

const documentGeometry: FullPageCaptureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 2000,
  extentWidth: 1280,
  outputHeight: 2000,
  outputWidth: 1280,
  rootKind: 'document',
  rootViewport: { height: 800, width: 1280, x: 0, y: 0 },
  viewportHeight: 800,
  viewportWidth: 1280,
};

function markCanonicalPlaceholder(placeholder: Element): void {
  placeholder.setAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE, 'true');
  placeholder.setAttribute('data-iframe-unreadable', 'true');
  placeholder.setAttribute('data-virtual-iframe', 'true');
}

it('replaces an unreadable iframe placeholder with an offline screenshot asset', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const placeholder = snapshot.createElement('div');
  markCanonicalPlaceholder(placeholder);
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'document');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '120');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '240');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '640');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '360');
  placeholder.setAttribute('data-iframe-source', 'https://external.example/embed');
  placeholder.textContent = 'Iframe content unavailable in static snapshot.';
  snapshot.body.appendChild(placeholder);
  const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    documentGeometry,
    { cropIframeRaster }
  );

  expect(cropIframeRaster).toHaveBeenCalledWith({ height: 360, width: 640, x: 120, y: 240 });
  expect(result.assets).toEqual([
    expect.objectContaining({
      localPath: 'assets/sniptale-iframe-raster-1.png',
      originalUrl: 'sniptale-iframe-raster:1',
    }),
  ]);
  expect(result.assets[0]?.blob.type).toBe('image/png');
  expect(result.rasterizedTargets).toEqual(['https://external.example/embed']);
  const image = snapshot.querySelector('img');
  expect(image?.getAttribute('src')).toBe('../assets/sniptale-iframe-raster-1.png');
  expect(image?.getAttribute('width')).toBe('640');
  expect(image?.getAttribute('height')).toBe('360');
  expect(placeholder.getAttribute('data-sniptale-iframe-rasterized')).toBe('true');
  expect(placeholder.hasAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE)).toBe(false);
  expect(snapshot.querySelector('script')).toBeNull();
});

it('keeps a bounded inert placeholder when its screenshot region is unavailable', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const placeholder = snapshot.createElement('div');
  markCanonicalPlaceholder(placeholder);
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '0');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '0');
  snapshot.body.appendChild(placeholder);

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    documentGeometry,
    { cropIframeRaster: vi.fn() }
  );

  expect(result).toEqual({ assets: [], rasterizedTargets: [] });
  expect(placeholder.hasAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE)).toBe(false);
  expect(snapshot.querySelector('img')).toBeNull();
});

it('materializes placeholders nested inside declarative shadow roots', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const host = snapshot.createElement('section');
  const boundary = snapshot.createElement('template');
  boundary.setAttribute('shadowrootmode', 'open');
  boundary.innerHTML = [
    `<div ${IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE}="true" data-iframe-unreadable="true" data-virtual-iframe="true"`,
    ` ${IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace}="document"`,
    ` ${IFRAME_RASTER_RECT_ATTRIBUTES.x}="10"`,
    ` ${IFRAME_RASTER_RECT_ATTRIBUTES.y}="20"`,
    ` ${IFRAME_RASTER_RECT_ATTRIBUTES.width}="300"`,
    ` ${IFRAME_RASTER_RECT_ATTRIBUTES.height}="200"></div>`,
  ].join('');
  host.appendChild(boundary);
  snapshot.body.appendChild(host);

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    {
      ...documentGeometry,
      extentHeight: 1000,
      extentWidth: 1000,
      outputHeight: 1000,
      outputWidth: 1000,
    },
    { cropIframeRaster: async () => new Blob(['png'], { type: 'image/png' }) }
  );

  expect(result.assets).toHaveLength(1);
  expect(boundary.content.querySelector('img')?.getAttribute('src')).toBe(
    '../assets/sniptale-iframe-raster-1.png'
  );
});

it('projects an iframe inside a dominant internal scroller into stitched output coordinates', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const placeholder = snapshot.createElement('div');
  markCanonicalPlaceholder(placeholder);
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'root-content');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '25');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '900');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '300');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '200');
  snapshot.body.appendChild(placeholder);
  const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));
  const internalGeometry: FullPageCaptureGeometry = {
    ...documentGeometry,
    extentHeight: 1600,
    extentWidth: 700,
    outputHeight: 1800,
    outputWidth: 800,
    rootKind: 'element',
    rootViewport: { height: 400, width: 700, x: 50, y: 100 },
    viewportHeight: 600,
    viewportWidth: 800,
  };

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    internalGeometry,
    { cropIframeRaster }
  );

  expect(cropIframeRaster).toHaveBeenCalledWith({
    height: 200,
    width: 300,
    x: 75,
    y: 1000,
  });
  expect(result.assets).toHaveLength(1);
});

it('fails closed when the source coordinate space does not match capture geometry', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const placeholder = snapshot.createElement('div');
  markCanonicalPlaceholder(placeholder);
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'root-content');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '25');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '900');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '300');
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '200');
  snapshot.body.appendChild(placeholder);
  const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    documentGeometry,
    { cropIframeRaster }
  );

  expect(cropIframeRaster).not.toHaveBeenCalled();
  expect(result.assets).toEqual([]);
  expect(placeholder.getAttribute('data-sniptale-iframe-raster-status')).toBe('invalid-geometry');
});

it('strips forged raster markers from non-iframe page content before materialization', async () => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const forged = snapshot.createElement('div');
  markCanonicalPlaceholder(forged);
  forged.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'document');
  forged.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.x, '10');
  forged.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.y, '20');
  forged.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.width, '300');
  forged.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.height, '200');
  snapshot.body.append(forged);
  sanitizePreparedSnapshotDocument(snapshot, 'https://hostile.example/page');
  const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    documentGeometry,
    { cropIframeRaster }
  );

  expect(cropIframeRaster).not.toHaveBeenCalled();
  expect(result).toEqual({ assets: [], rasterizedTargets: [] });
  expect(forged.hasAttribute(IFRAME_RASTER_PLACEHOLDER_ATTRIBUTE)).toBe(false);
});

it.each([
  { height: 200, width: 300, x: -1, y: 20 },
  { height: 200, width: 300, x: 1000, y: 20 },
])('rejects a projected iframe region outside the stitched output: %o', async (region) => {
  const snapshot = document.implementation.createHTMLDocument('snapshot');
  const placeholder = snapshot.createElement('div');
  markCanonicalPlaceholder(placeholder);
  placeholder.setAttribute(IFRAME_RASTER_RECT_ATTRIBUTES.coordinateSpace, 'document');
  for (const [key, value] of Object.entries(region)) {
    placeholder.setAttribute(
      IFRAME_RASTER_RECT_ATTRIBUTES[key as keyof typeof IFRAME_RASTER_RECT_ATTRIBUTES],
      String(value)
    );
  }
  snapshot.body.append(placeholder);
  const cropIframeRaster = vi.fn(async () => new Blob(['png'], { type: 'image/png' }));

  const result = await materializeUnreadableIframeRasters(
    snapshot,
    new Blob(['full-page'], { type: 'image/png' }),
    documentGeometry,
    { cropIframeRaster }
  );

  expect(cropIframeRaster).not.toHaveBeenCalled();
  expect(result.assets).toEqual([]);
  expect(placeholder.getAttribute('data-sniptale-iframe-raster-status')).toBe('out-of-bounds');
});
