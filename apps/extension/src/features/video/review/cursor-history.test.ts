import { expect, it } from 'vitest';
import { buildHistoryCursorRuns } from './cursor-history';

it('condenses observed movement and dwell without bridging a hidden or new capture segment', () => {
  const track = {
    captureMode: 'separate' as const,
    skin: {
      animationPreset: 'NONE' as const,
      color: '#fff',
      hidden: false,
      preset: 'ARROW' as const,
      scale: 1,
      shadow: false,
    },
    samples: [
      { id: 'a', time: 0, x: 0, y: 0, visible: true, captureSegment: 0 },
      { id: 'b', time: 0.1, x: 1, y: 1, visible: true, captureSegment: 0 },
      { id: 'c', time: 0.2, x: 2, y: 2, visible: true, captureSegment: 0 },
      { id: 'd', time: 1.2, x: 2, y: 2, visible: true, captureSegment: 0 },
      { id: 'hidden', time: 2, x: 2, y: 2, visible: false, captureSegment: 0 },
      { id: 'return', time: 3, x: 2, y: 2, visible: true, captureSegment: 1 },
      { id: 'end', time: 3.1, x: 3, y: 3, visible: true, captureSegment: 1 },
    ],
  };
  const original = structuredClone(track);
  const runs = buildHistoryCursorRuns(track, 5);
  expect(runs.map(({ kind }) => kind)).toEqual([
    'cursor',
    'cursor-idle',
    'cursor-gap',
    'cursor-gap',
    'cursor',
  ]);
  expect(runs[0]?.sampleIds).toEqual(['a', 'b']);
  expect(runs.at(-1)?.end).toBe(3.1);
  expect(track).toEqual(original);
});

it('uses captured dwell masks within sparse movement samples and stops at an observation boundary', () => {
  const track = {
    captureMode: 'separate' as const,
    skin: {
      animationPreset: 'NONE' as const,
      color: '#fff',
      hidden: false,
      preset: 'ARROW' as const,
      scale: 1,
      shadow: false,
    },
    samples: [
      { id: 'a', time: 0, x: 0, y: 0, visible: true, captureSegment: 0 },
      { id: 'b', time: 3, x: 100, y: 100, visible: true, captureSegment: 0 },
      {
        id: 'hidden',
        time: 5,
        x: 100,
        y: 100,
        visible: false,
        captureSegment: 0,
        observation: 'hidden' as const,
      },
      { id: 'return', time: 7, x: 100, y: 100, visible: true, captureSegment: 1 },
    ],
  };
  const runs = buildHistoryCursorRuns(track, 8, [
    { id: 'first-idle', startTime: 0, endTime: 2 },
    { id: 'last-idle', startTime: 3, endTime: 5 },
  ]);
  expect(runs.map(({ kind, start, end }) => [kind, start, end])).toEqual([
    ['cursor-idle', 0, 2],
    ['cursor', 2, 3],
    ['cursor-idle', 3, 5],
    ['cursor-gap', 5, 7],
  ]);
});
