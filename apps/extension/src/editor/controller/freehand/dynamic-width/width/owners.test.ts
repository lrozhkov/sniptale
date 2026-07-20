import { expect, it } from 'vitest';
import type { EditorBrushSettings } from '../../../../../features/editor/document/types';
import { stabilizeEndpointWidths } from './endpoints';
import { resolveDynamicWidthPoints } from './points';
import { resolveSpeedRatios, resolveWarmStartRatios } from './ratios';
import { normalizeStrokeSamples } from './samples';

const settings: EditorBrushSettings = {
  color: '#ff0000',
  dynamicWidth: true,
  opacity: 1,
  shapeCorrection: 'off',
  shadow: 0,
  smoothingLevel: 0,
  width: 10,
};

it('normalizes missing or mismatched sample streams from freehand points', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
  ];

  expect(normalizeStrokeSamples(points, null)).toEqual([
    { t: 0, x: 0, y: 0 },
    { t: 16, x: 12, y: 0 },
  ]);
  expect(normalizeStrokeSamples(points, [{ t: 5, x: 1, y: 2 }])).toHaveLength(2);
});

it('derives smoothed speed ratios and dynamic widths from samples', () => {
  const samples = [
    { t: 0, x: 0, y: 0 },
    { t: 16, x: 4, y: 0 },
    { t: 32, x: 40, y: 0 },
  ];

  expect(resolveSpeedRatios(samples)[2]).toBeLessThan(1);
  expect(resolveDynamicWidthPoints(samples, settings, samples)[2]!.width).toBeLessThan(
    settings.width
  );
});

it('keeps empty and single-sample width calculations finite', () => {
  const singleSample = [{ t: 0, x: 0, y: 0 }];

  expect(resolveDynamicWidthPoints([], settings, null)).toEqual([]);
  expect(resolveSpeedRatios(singleSample)).toEqual([1]);
  expect(resolveWarmStartRatios([], [0.5])).toEqual([0.5]);
});

it('stabilizes endpoint widths without mutating the input points', () => {
  const points = [
    { width: 2, x: 0, y: 0 },
    { width: 10, x: 30, y: 0 },
    { width: 4, x: 60, y: 0 },
  ];

  const stabilized = stabilizeEndpointWidths(points);

  expect(stabilized[0]!.width).not.toBe(points[0]!.width);
  expect(points[0]!.width).toBe(2);
});
