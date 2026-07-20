import { describe, expect, it } from 'vitest';
import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { buildArrowPathData } from '../paths';
import { buildStrokedArrowPathData } from './stroked';

function createSettings(overrides: Partial<EditorArrowSettings> = {}): EditorArrowSettings {
  return {
    arrowType: 'sharp',
    bowing: 0,
    color: '#ff671d',
    dynamicWidth: false,
    endHead: 'diamond',
    endHeadSize: 3,
    mode: 'straight',
    opacity: 1,
    roughness: 0,
    shadow: 0,
    startHead: 'arrow',
    startHeadSize: 2,
    style: 'dash',
    variant: 'standard',
    width: 24,
    ...overrides,
  };
}

describe('arrow stroked path rendering', () => {
  it('returns an empty path when there are not enough points', () => {
    expect(buildStrokedArrowPathData([], createSettings())).toBe('');
  });

  it('renders dashed arrows as open stroke geometry instead of a filled shaft outline', () => {
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ],
      createSettings()
    );

    expect(path).toContain('M');
    expect(path).not.toContain('NaN');
    expect(path).not.toContain('Infinity');
    expect(path.split(' Z').length).toBeLessThan(3);
  });

  it('uses zero sketch settings when roughness and bowing are omitted', () => {
    const { bowing: _bowing, roughness: _roughness, ...settings } = createSettings();
    const path = buildArrowPathData(
      [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
      ],
      settings
    );

    expect(path).toContain('M');
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it('keeps rough and bowing deterministic for line-style arrows at high width', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 80, y: 40 },
      { x: 160, y: 0 },
    ];
    const settings = createSettings({ arrowType: 'curved', bowing: 2.5, roughness: 2.5 });

    expect(buildArrowPathData(points, settings)).toBe(buildArrowPathData(points, settings));
  });
});
