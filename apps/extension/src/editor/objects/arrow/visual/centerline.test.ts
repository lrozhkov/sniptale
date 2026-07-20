import { expect, it } from 'vitest';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';

import { buildArrowCenterline } from './centerline/build';

function createCurveSettings(): EditorArrowSettings {
  return {
    color: '#f60',
    endHead: 'triangle',
    mode: 'curve',
    opacity: 1,
    shadow: 0,
    startHead: 'none',
    variant: 'standard',
    width: 6,
  };
}

function createSharpSettings(): EditorArrowSettings {
  return {
    ...createCurveSettings(),
    arrowType: 'sharp',
    dynamicWidth: false,
    mode: 'straight',
    variant: 'standard',
  };
}

it('skips collapsed end segments when resolving the end angle', () => {
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 60 },
      { x: 60, y: 60 },
      { x: 60, y: 60 },
    ],
    createCurveSettings()
  );

  expect(centerline.points.at(-1)).toEqual({ x: 60, y: 60 });
  expect(Math.abs(centerline.startAngle)).toBeLessThan(0.02);
  expect(Math.abs(Math.abs(centerline.endAngle) - Math.PI / 2)).toBeLessThan(0.4);
});

it('keeps elbow centerline points instead of collapsing them to a diagonal', () => {
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 80, y: 60 },
    ],
    { ...createSharpSettings(), arrowType: 'elbow' }
  );

  expect(centerline.points).toEqual([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 60 },
    { x: 80, y: 60 },
  ]);
  expect(Math.abs(centerline.endAngle)).toBeLessThan(0.02);
});

it('orients elbow arrowheads by the dominant endpoint movement', () => {
  const sideways = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 100, y: 20 },
    ],
    { ...createSharpSettings(), arrowType: 'elbow' }
  );
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 20, y: 100 },
    ],
    { ...createSharpSettings(), arrowType: 'elbow' }
  );

  expect(sideways.points.at(-2)).toEqual({ x: 50, y: 20 });
  expect(Math.abs(sideways.endAngle)).toBeLessThan(0.02);
  expect(centerline.points.at(-2)).toEqual({ x: 20, y: 50 });
  expect(Math.abs(Math.abs(centerline.endAngle) - Math.PI / 2)).toBeLessThan(0.02);
});

it('uses arrowType curved even when legacy mode is straight', () => {
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
    ],
    { ...createSharpSettings(), arrowType: 'curved' }
  );

  expect(centerline.points.length).toBeGreaterThan(8);
  expect(centerline.points.at(0)).toEqual({ x: 0, y: 0 });
  expect(centerline.points.at(-1)).toEqual({ x: 120, y: 0 });
});

it('orients arrowheads by the authored terminal segment instead of curve overshoot', () => {
  const centerline = buildArrowCenterline(
    [
      { x: 0, y: 0 },
      { x: 80, y: 120 },
      { x: 160, y: 0 },
    ],
    { ...createCurveSettings(), arrowType: 'curved' }
  );

  expect(centerline.startAngle).toBeGreaterThan(0);
  expect(centerline.endAngle).toBeLessThan(0);
});
