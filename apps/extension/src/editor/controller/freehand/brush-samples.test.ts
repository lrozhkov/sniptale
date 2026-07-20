import { Point } from 'fabric';
import { expect, it, vi } from 'vitest';
import {
  appendFreehandPointSample,
  mergeDenseDynamicWidthPoint,
  resolveFreehandStrokeSamples,
  resolvePointerTimestamp,
} from './brush-samples';

it('resolves event timestamps and falls back to performance time', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValueOnce(1234);

  expect(resolvePointerTimestamp({ timeStamp: 42 })).toBe(42);
  expect(resolvePointerTimestamp({ timeStamp: Number.NaN })).toBe(1234);

  now.mockRestore();
});

it('keeps explicit stroke samples and falls back to point timestamps when samples are stale', () => {
  expect(
    resolveFreehandStrokeSamples({
      currentTimestamp: 99,
      points: [new Point(1, 2), new Point(3, 4)],
      strokeSamples: [
        { t: 10, x: 1, y: 2 },
        { t: 20, x: 3, y: 4 },
      ],
    })
  ).toEqual([
    { t: 10, x: 1, y: 2 },
    { t: 20, x: 3, y: 4 },
  ]);
  expect(
    resolveFreehandStrokeSamples({
      currentTimestamp: 99,
      points: [new Point(1, 2), new Point(3, 4)],
      strokeSamples: [],
    })
  ).toEqual([
    { t: 99, x: 1, y: 2 },
    { t: 99, x: 3, y: 4 },
  ]);
});

it('merges dense dynamic-width samples only while preserving drawn segment shape', () => {
  const points = [new Point(0, 0), new Point(1, 0)];
  const strokeSamples = [
    { t: 0, x: 0, y: 0 },
    { t: 10, x: 1, y: 0 },
  ];

  expect(
    mergeDenseDynamicWidthPoint({
      currentTimestamp: 20,
      dynamicWidth: true,
      point: new Point(1.5, 0),
      points,
      strokeSamples,
    })
  ).toBe(true);
  expect(points).toEqual([new Point(0, 0), new Point(1.5, 0)]);
  expect(strokeSamples.at(-1)).toEqual({ t: 20, x: 1.5, y: 0 });

  appendFreehandPointSample({
    currentTimestamp: 30,
    point: new Point(10, 0),
    strokeSamples,
  });
  expect(strokeSamples.at(-1)).toEqual({ t: 30, x: 10, y: 0 });
});
