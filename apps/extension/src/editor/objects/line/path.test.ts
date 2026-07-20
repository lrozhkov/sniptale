import { describe, expect, it } from 'vitest';
import type { EditorLineSettings } from '../../../features/editor/document/line-types';
import { buildLinePathData, resolveLineDashArray } from './path';

const settings: EditorLineSettings = {
  color: '#111827',
  corners: 'round',
  fillColor: '#ffffff',
  fillMode: 'none',
  fillOpacity: 1,
  gradientAngle: 0,
  gradientFrom: '#ffffff',
  gradientTo: '#000000',
  opacity: 1,
  shadow: 0,
  shadowAngle: 90,
  shadowColor: '#111827',
  roughFillAngle: -45,
  roughFillColor: '#ffffff',
  roughFillGap: 8,
  roughFillStyle: 'hachure',
  roughFillWeight: 1,
  roughFillRoughness: 1,
  roughFillBowing: 1,
  roughFillOpacity: 1,
  roughness: 0,
  style: 'solid',
  width: 4,
};

describe('line path', () => {
  it('builds rounded open and closed paths from point geometry', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 60 },
    ];

    expect(buildLinePathData(points, settings, false)).toContain('Q 80 0');
    expect(buildLinePathData(points, settings, true)).toMatch(/Z$/);
    expect(buildLinePathData(points, { ...settings, corners: 'sharp' }, false)).toBe(
      'M 0 0 L 80 0 L 80 60'
    );
  });

  it('maps line styles to stable dash arrays', () => {
    expect(resolveLineDashArray({ ...settings, style: 'solid' })).toBeUndefined();
    expect(resolveLineDashArray({ ...settings, style: 'dash' })).toEqual([16, 9.6]);
    expect(resolveLineDashArray({ ...settings, style: 'dot' })).toEqual([4, 8.8]);
    expect(resolveLineDashArray({ ...settings, style: 'dash-dot' })).toEqual([16, 8, 4, 8]);
    expect(resolveLineDashArray({ ...settings, style: 'long-dash' })).toEqual([28, 11.2]);
  });
});
