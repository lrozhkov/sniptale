import { describe, expect, it } from 'vitest';
import type {
  EditorArrowHead,
  EditorArrowSettings,
} from '../../../../features/editor/document/types';
import { buildArrowPathData } from '../paths';

const HEADS: EditorArrowHead[] = [
  'none',
  'arrow',
  'triangle',
  'triangle-outline',
  'bar',
  'circle',
  'circle-outline',
  'diamond',
  'diamond-outline',
  'crosshair-circle',
  'open',
  'block',
];

function createSettings(overrides: Partial<EditorArrowSettings>): EditorArrowSettings {
  return {
    arrowType: 'sharp',
    bowing: 0,
    color: '#ff671d',
    dynamicWidth: false,
    endHead: 'triangle',
    endHeadSize: 1,
    mode: 'straight',
    opacity: 1,
    roughness: 0,
    shadow: 0,
    startHead: 'none',
    startHeadSize: 1,
    style: 'solid',
    variant: 'standard',
    width: 4,
    ...overrides,
  };
}

function expectFinitePath(path: string): void {
  expect(path).toContain('M');
  expect(path).not.toMatch(/NaN|Infinity/);
}

describe('arrow visual combination matrix', () => {
  it('keeps all head combinations finite across large widths, sizes, styles, and sketching', () => {
    for (const head of HEADS) {
      for (const style of ['solid', 'dash'] as const) {
        const path = buildArrowPathData(
          [
            { x: 0, y: 0 },
            { x: 80, y: 40 },
            { x: 160, y: 0 },
          ],
          createSettings({
            arrowType: 'curved',
            bowing: style === 'solid' ? 2.5 : 1.5,
            endHead: head,
            endHeadSize: 6,
            roughness: style === 'solid' ? 2.5 : 1.5,
            startHead: head,
            startHeadSize: 6,
            style,
            width: 36,
          })
        );

        expectFinitePath(path);
      }
    }
  });
});
