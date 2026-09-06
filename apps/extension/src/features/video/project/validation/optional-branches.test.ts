import { expect, it } from 'vitest';
import { isObjectTrack } from './optional-branches';

const sample = { time: 1, x: 2, y: 3, visible: true, confidence: 1 };
const track = { id: 'track', kind: 'object', source: 'visualDetection', samples: [sample] };

it.each([null, 1, {}, []])('rejects malformed per-point source ownership: %j', (sourceClipId) => {
  expect(isObjectTrack({ ...track, samples: [{ ...sample, sourceClipId }] })).toBe(false);
  expect(
    isObjectTrack({
      ...track,
      correctionAnchors: [{ id: 'anchor', time: 1, x: 2, y: 3, sourceClipId }],
    })
  ).toBe(false);
});

it('accepts explicit point ownership and unbound manual geometry', () => {
  expect(isObjectTrack(track)).toBe(true);
  expect(
    isObjectTrack({
      ...track,
      samples: [{ ...sample, sourceClipId: 'tail' }],
      correctionAnchors: [{ id: 'anchor', time: 1, x: 2, y: 3, sourceClipId: 'tail' }],
    })
  ).toBe(true);
});

it('validates persisted analyzed points together with their detector metadata and corrections', () => {
  const analysis = {
    sourceAssetId: 'asset',
    sourceClipId: 'head',
    projectStartTime: 0,
    projectEndTime: 8,
    sampleFps: 2,
    mode: 'visualFrames',
    quality: {
      coverageRatio: 1,
      jumpCount: 0,
      medianConfidence: 0.9,
      status: 'usable',
      visibleSamples: 2,
    },
  };
  const analyzed = {
    ...track,
    analysis,
    detectorVersion: 'v1',
    hidden: false,
    role: 'cameraCursor',
    samples: [{ ...sample, sourceClipId: 'tail', width: 10, height: 20 }],
    correctionAnchors: [
      { id: 'anchor', time: 1, x: 2, y: 3, confidence: 0.9, sourceClipId: 'tail' },
    ],
  };
  expect(isObjectTrack(analyzed)).toBe(true);
  expect(isObjectTrack({ ...analyzed, analysis: { ...analysis, sampleFps: 0 } })).toBe(false);
  expect(
    isObjectTrack({ ...analyzed, samples: [{ ...sample, sourceClipId: 'tail', width: -1 }] })
  ).toBe(false);
  expect(
    isObjectTrack({
      ...analyzed,
      correctionAnchors: [
        { id: 'anchor', time: 1, x: 2, y: 3, confidence: NaN, sourceClipId: 'tail' },
      ],
    })
  ).toBe(false);
});
