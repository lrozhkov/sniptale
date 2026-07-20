import { expect, it } from 'vitest';
import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import { buildRoughLinePathData, shouldRenderRoughLine } from './rough';

const settings: EditorLineSettings = {
  color: '#111827',
  corners: 'round',
  fillColor: '#ffffff',
  fillMode: 'none',
  fillOpacity: 0.4,
  gradientAngle: 0,
  gradientFrom: '#ffffff',
  gradientTo: '#ff671d',
  opacity: 0.7,
  shadow: 0,
  shadowAngle: 90,
  shadowColor: '#111827',
  roughFillAngle: -41,
  roughFillColor: '#ffffff',
  roughFillGap: 8,
  roughFillStyle: 'hachure',
  roughFillWeight: 1,
  roughFillRoughness: 1,
  roughFillBowing: 1,
  roughFillOpacity: 0.4,
  roughness: 1,
  style: 'solid',
  width: 4,
};

it('builds deterministic rough paths for open, polyline, and closed fill modes', () => {
  expect(shouldRenderRoughLine({ ...settings, roughness: 0 })).toBe(false);
  expect(shouldRenderRoughLine({ ...settings, roughness: 0, bowing: 1 })).toBe(true);
  expect(shouldRenderRoughLine({ ...settings, roughness: 0, fillMode: 'rough' })).toBe(false);
  expect(buildRoughLinePathData([], settings, false)).toBe('M 0 0 L 0 0');
  expect(
    buildRoughLinePathData(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      { ...settings, bowing: 1 },
      false
    )
  ).toContain('M');
  expect(
    buildRoughLinePathData(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 30 },
      ],
      { ...settings, fillMode: 'rough', roughFillStyle: 'cross-hatch' },
      true
    )
  ).toContain('M');
});

it('uses line roughness for closed pencil-filled outlines', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
  ];
  const smoothLine = buildRoughLinePathData(
    points,
    {
      ...settings,
      fillMode: 'rough',
      roughFillRoughness: 0,
      roughFillBowing: 0,
    },
    true
  );
  const roughLine = buildRoughLinePathData(
    points,
    {
      ...settings,
      fillMode: 'rough',
      roughness: 4,
      bowing: 4,
      roughFillRoughness: 0,
      roughFillBowing: 0,
    },
    true
  );

  expect(roughLine).not.toBe(smoothLine);
});

it('keeps a fillable closed shape when regular fills use rough line rendering', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 30 },
  ];

  expect(buildRoughLinePathData(points, { ...settings, fillMode: 'color' }, true)).toMatch(
    /^M[^M]*\sL[^M]*\sL/
  );
  expect(buildRoughLinePathData(points, { ...settings, fillMode: 'gradient' }, true)).toMatch(
    /^M[^M]*\sL[^M]*\sL/
  );
});
