import { describe, expect, it } from 'vitest';
import type { FrameData } from '../contracts';
import { projectElementFrameSurface, resolveFrameSurface } from '.';

function createFrame(overrides: Partial<FrameData> = {}): FrameData {
  return {
    id: 'frame-1',
    x: 10.5,
    y: 20.25,
    width: 120,
    height: 80,
    effectMode: 'border',
    borderSettings: {
      sourcePresetId: 'border',
      sourcePresetName: 'Border',
      width: 20,
      color: '#f97316',
      style: 'solid',
      radius: 60,
      padding: { top: 2, right: 3, bottom: 4, left: 5 },
      shadow: 0,
      opacity: 100,
      strokeOpacity: 100,
      fillColor: '#facc15',
      fillOpacity: 25,
      inheritCustomCss: false,
      customCss: '',
    },
    ...overrides,
  };
}

describe('frame-surface resolveFrameSurface', () => {
  it.each([
    ['border', undefined, undefined, true],
    ['blur', false, undefined, false],
    ['blur', true, undefined, true],
    ['focus', undefined, false, false],
    ['focus', undefined, true, true],
  ] as const)(
    'keeps one outer geometry for %s decoration state',
    (effectMode, blurShowBorder, focusShowBorder, decorationVisible) => {
      const frame = createFrame({
        effectMode,
        ...(blurShowBorder === undefined
          ? {}
          : { blurSettings: { amount: 10, blurType: 'gaussian', showBorder: blurShowBorder } }),
        ...(focusShowBorder === undefined
          ? {}
          : { focusSettings: { opacity: 0.5, showBorder: focusShowBorder } }),
      });

      expect(resolveFrameSurface(frame)).toEqual({
        geometry: {
          x: 10.5,
          y: 20.25,
          width: 120,
          height: 80,
          radius: 40,
          strokeWidth: 20,
        },
        decorationVisible,
        strokeVisible: decorationVisible,
        fillVisible: decorationVisible,
      });
    }
  );

  it('clamps an inward stroke and radius to a tiny free frame', () => {
    expect(resolveFrameSurface(createFrame({ width: 1, height: 3 })).geometry).toEqual({
      x: 10.5,
      y: 20.25,
      width: 1,
      height: 3,
      radius: 0.5,
      strokeWidth: 0.5,
    });
  });
});

describe('frame-surface projectElementFrameSurface', () => {
  it('measures padding to the inner edge of the inward stroke', () => {
    expect(
      projectElementFrameSurface(
        { x: 40, y: 30, width: 160, height: 90 },
        {
          strokeWidth: 2,
          padding: { top: 4, right: 6, bottom: 7, left: 5 },
        }
      )
    ).toEqual({ x: 33, y: 24, width: 175, height: 105 });
  });
});
