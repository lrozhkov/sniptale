import { expect, it, vi } from 'vitest';

import { parseStep } from './step/parse';

function createCaptureStepRecord() {
  return {
    id: 'capture-1',
    kind: 'capture',
    assetId: 'asset-1',
    caption: 'Legacy caption',
    createdAt: 11,
    updatedAt: 12,
    captureSurface: 'visible',
    sourceKind: 'auto-click',
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 90,
      devicePixelRatio: 1,
    },
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
  };
}

function createNoteStepRecord() {
  return {
    id: 'note-1',
    kind: 'note',
    title: 'Heads up',
    subtitle: 'Legacy subtitle',
    createdAt: 13,
    updatedAt: 14,
    tone: 'unknown',
  };
}

it('parses capture steps with fallback metadata and legacy body fields', () => {
  vi.spyOn(Date, 'now').mockReturnValue(500);

  const step = parseStep(createCaptureStepRecord(), 0);

  expect(step).toEqual(
    expect.objectContaining({
      id: 'capture-1',
      body: 'Legacy caption',
      captureMetadata: expect.objectContaining({ trigger: 'pointer-up' }),
    })
  );
});

it('normalizes note tone and rejects invalid capture steps', () => {
  expect(parseStep(createNoteStepRecord(), 0)).toEqual(
    expect.objectContaining({
      id: 'note-1',
      tone: 'neutral',
      body: 'Legacy subtitle',
    })
  );

  expect(
    parseStep(
      {
        id: 'broken-capture',
        kind: 'capture',
        createdAt: 19,
        updatedAt: 20,
      },
      0
    )
  ).toBeNull();
});
