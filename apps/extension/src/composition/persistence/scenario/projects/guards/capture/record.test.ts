import { expect, it } from 'vitest';

import { parseCaptureMetadata } from './record';
import { createOverlayFixtures, createValidCaptureRecord } from './test-support';

it('parses root capture fields and metadata fallbacks', () => {
  const capture = parseCaptureMetadata({
    ...createValidCaptureRecord(),
    overlays: createOverlayFixtures(),
  });

  expect(capture).toEqual(
    expect.objectContaining({
      assetId: 'asset-1',
      galleryAssetId: 'gallery-1',
      captureSurface: 'full',
      sourceKind: 'auto-click',
      interactionPoint: { x: 12, y: 16 },
      cursorPoint: { x: 14, y: 18 },
      target: expect.objectContaining({
        framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
      }),
      imageTransform: { scale: 1.4, x: -10, y: 12 },
      viewportTransform: { x: 20, y: 30, width: 500, height: 320 },
      captureMetadata: expect.objectContaining({
        trigger: 'pointer-up',
      }),
      annotationRenderMode: 'overlays',
    })
  );
});

it('falls back when root capture fields are malformed', () => {
  const capture = parseCaptureMetadata({
    assetId: 10,
    captureSurface: 'broken',
    sourceKind: 'broken',
    annotationRenderMode: 'asset',
    overlays: 'broken',
  } as Record<string, unknown>);

  expect(capture).toEqual(
    expect.objectContaining({
      assetId: null,
      captureSurface: 'visible',
      sourceKind: 'manual',
      annotationRenderMode: 'asset',
      overlays: [],
    })
  );
});

it('preserves blur overlays from shared capture fixtures on the parsed record', () => {
  const capture = parseCaptureMetadata({
    ...createValidCaptureRecord(),
    overlays: createOverlayFixtures(),
  });

  expect(capture.overlays).toContainEqual(
    expect.objectContaining({
      kind: 'blur-rect',
      blurSettings: { amount: 13, blurType: 'gaussian', showBorder: false },
    })
  );
});
