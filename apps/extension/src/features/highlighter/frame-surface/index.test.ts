import { describe, expect, it } from 'vitest';
import type { FrameData } from '../contracts';
import { projectElementFrameSurface, reprojectFrameSurfacePadding, resolveFrameSurface } from '.';

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
      fillColor: '#facc15',
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

  it('keeps an outward stroke independent from a tiny inner frame', () => {
    expect(resolveFrameSurface(createFrame({ width: 1, height: 3 })).geometry).toEqual({
      x: 10.5,
      y: 20.25,
      width: 1,
      height: 3,
      radius: 0.5,
      strokeWidth: 20,
    });
  });
});

describe('frame-surface projectElementFrameSurface', () => {
  it('projects padding before the outward stroke without shrinking the selected area', () => {
    expect(
      projectElementFrameSurface(
        { x: 40, y: 30, width: 160, height: 90 },
        {
          padding: { top: 4, right: 6, bottom: 7, left: 5 },
        }
      )
    ).toEqual({ x: 35, y: 26, width: 171, height: 101 });
  });

  it('reprojects an existing surface when template padding changes', () => {
    expect(
      reprojectFrameSurfacePadding(
        { x: 35, y: 26, width: 171, height: 101 },
        { top: 4, right: 6, bottom: 7, left: 5 },
        { top: 10, right: 12, bottom: 13, left: 11 }
      )
    ).toEqual({ x: 29, y: 20, width: 183, height: 113 });
  });
});
