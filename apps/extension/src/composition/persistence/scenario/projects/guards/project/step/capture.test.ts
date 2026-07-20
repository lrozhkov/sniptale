import { expect, it } from 'vitest';

import { parseStepBase } from './base';
import { parseCaptureStep } from './capture';

function createCaptureRecord() {
  return {
    assetId: 'asset-1',
    caption: 'Legacy caption',
    captureMetadata: {
      pointerRange: {
        start: { x: 10, y: 12 },
        end: { x: 18, y: 24 },
        minX: 10,
        minY: 12,
        maxX: 18,
        maxY: 24,
        distance: 14,
        durationMs: 160,
      },
      scroll: {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 120,
        deltaX: 0,
        deltaY: 120,
      },
      trigger: 'pointer-up',
    },
    captureSurface: 'visible',
    createdAt: 11,
    id: 'capture-1',
    kind: 'capture',
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 90,
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
    },
    sourceKind: 'auto-click',
    updatedAt: 12,
  } as Record<string, unknown>;
}

it('parses capture steps with metadata fallback', () => {
  const record = {
    ...createCaptureRecord(),
    overlays: [
      {
        id: 'focus-1',
        kind: 'focus-rect',
        rect: { x: 1, y: 2, width: 30, height: 40 },
      },
    ],
  } as Record<string, unknown>;
  const base = parseStepBase(record, 0);
  const step = parseCaptureStep(record, base);

  expect(step).toEqual(
    expect.objectContaining({
      id: 'capture-1',
      body: 'Legacy caption',
      captureMetadata: expect.objectContaining({ trigger: 'pointer-up' }),
      overlays: [expect.objectContaining({ id: 'focus-1', kind: 'focus-rect' })],
    })
  );
});

it('rejects capture steps without required asset ids', () => {
  const base = parseStepBase(
    {
      createdAt: 11,
      id: 'broken-capture',
      kind: 'capture',
      updatedAt: 12,
    } as Record<string, unknown>,
    0
  );

  expect(parseCaptureStep({ kind: 'capture' } as Record<string, unknown>, base)).toBeNull();
});

it('keeps nullable target fields omitted when they are not present', () => {
  const record = createCaptureRecord();
  const base = parseStepBase(record, 0);
  const step = parseCaptureStep(record, base);

  expect(step).toEqual(
    expect.objectContaining({
      assetId: 'asset-1',
      galleryAssetId: null,
      target: null,
    })
  );
});
