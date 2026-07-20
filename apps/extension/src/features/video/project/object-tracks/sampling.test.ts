import { expect, it } from 'vitest';

import {
  isCameraCursorObjectTrack,
  isInternalVideoObjectTrack,
  normalizeVideoObjectTrack,
} from './sampling';
import type { VideoObjectTrack } from './types';

it('sorts usable samples and clamps confidence without mutating the source', () => {
  const source = createTrack({
    id: 'cursorTrack',
    samples: [
      { confidence: 2, time: 2, visible: true, x: 20, y: 10 },
      { confidence: -1, time: 1, visible: false, x: 10, y: 5 },
      { confidence: 0.5, time: Number.NaN, visible: true, x: 0, y: 0 },
    ],
  });

  const normalized = normalizeVideoObjectTrack(source);

  expect(normalized.id).toBe('object-cursorTrack');
  expect(normalized.samples).toEqual([
    { confidence: 0, time: 1, visible: false, x: 10, y: 5 },
    { confidence: 1, time: 2, visible: true, x: 20, y: 10 },
  ]);
  expect(source.samples).toHaveLength(3);
});

it('normalizes valid analysis and anchors', () => {
  const normalized = normalizeVideoObjectTrack(
    createTrack({
      analysis: {
        mode: 'visualFrames',
        projectEndTime: 1,
        projectStartTime: 2,
        quality: {
          coverageRatio: 2,
          jumpCount: -4,
          medianConfidence: Number.NaN,
          status: 'usable',
          visibleSamples: 1.8,
        },
        sampleFps: 30,
        sourceAssetId: 'asset-1',
        sourceClipId: 'clip-1',
      },
      correctionAnchors: [
        { confidence: 3, id: 'later', time: 2, x: 2, y: 2 },
        { confidence: -2, id: 'earlier', time: 1, x: 1, y: 1 },
        { id: 'invalid', time: 3, x: Number.NaN, y: 3 },
      ],
    })
  );

  expect(normalized.analysis).toEqual(
    expect.objectContaining({
      projectEndTime: 2,
      quality: {
        coverageRatio: 1,
        jumpCount: 0,
        medianConfidence: 0,
        status: 'usable',
        visibleSamples: 1,
      },
    })
  );
  expect(normalized.correctionAnchors).toEqual([
    { confidence: 0, id: 'earlier', time: 1, x: 1, y: 1 },
    { confidence: 1, id: 'later', time: 2, x: 2, y: 2 },
  ]);
});

it('drops invalid analysis metadata', () => {
  const invalid = normalizeVideoObjectTrack(
    createTrack({
      analysis: {
        projectEndTime: 1,
        projectStartTime: 0,
        sampleFps: 0,
        sourceAssetId: '',
        sourceClipId: 'clip-1',
      },
    })
  );

  expect(invalid.analysis).toBeUndefined();
});

it('recognizes only hidden visual camera-cursor tracks as internal camera authority', () => {
  const cameraCursor = createTrack({
    hidden: true,
    kind: 'visualCursor',
    role: 'cameraCursor',
    source: 'visualDetection',
  });

  expect(isInternalVideoObjectTrack(cameraCursor)).toBe(true);
  expect(isCameraCursorObjectTrack(cameraCursor)).toBe(true);
  expect(isCameraCursorObjectTrack({ ...cameraCursor, hidden: false })).toBe(false);
});
function createTrack(overrides: Partial<VideoObjectTrack> = {}): VideoObjectTrack {
  return {
    id: 'track-1',
    kind: 'object',
    samples: [],
    source: 'manual',
    ...overrides,
  };
}
