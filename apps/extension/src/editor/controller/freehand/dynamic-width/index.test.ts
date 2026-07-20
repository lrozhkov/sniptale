import { describe, expect, it } from 'vitest';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { buildDynamicFreehandPathData } from './';

const settings: EditorBrushSettings = {
  color: '#ff0000',
  dynamicWidth: true,
  opacity: 1,
  shapeCorrection: 'off',
  shadow: 0,
  smoothingLevel: 0,
  width: 8,
};

describe('editor-controller freehand dynamic-width entry seam', () => {
  it('rejects empty strokes and renders single-point strokes as dots', () => {
    expect(buildDynamicFreehandPathData([], settings, null)).toBeNull();
    const dotPath = buildDynamicFreehandPathData([{ x: 1, y: 2 }], settings, null);
    expect(dotPath?.[0]?.[0]).toBe('M');
    expect(dotPath?.at(-1)?.[0]).toBe('Z');
  });

  it('builds a closed outline from point samples', () => {
    const pathData = buildDynamicFreehandPathData(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      settings,
      [
        { t: 0, x: 0, y: 0 },
        { t: 80, x: 20, y: 0 },
      ]
    );

    expect(pathData?.[0]?.[0]).toBe('M');
    expect(pathData?.at(-1)?.[0]).toBe('Z');
  });
});

describe('editor-controller freehand dynamic-width preview seam', () => {
  it('uses coarse build options to keep live preview path size bounded', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 220, y: 0 },
    ];
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 220, y: 0 },
    ];
    const defaultPath = buildDynamicFreehandPathData(
      points,
      { ...settings, smoothingLevel: 10 },
      samples
    );
    const previewPath = buildDynamicFreehandPathData(
      points,
      { ...settings, smoothingLevel: 10 },
      samples,
      { smoothingIterationLimit: 8, smoothingStepPx: 8 }
    );

    expect(defaultPath).not.toBeNull();
    expect(previewPath).not.toBeNull();
    expect(previewPath!.length).toBeLessThan(defaultPath!.length / 2);
    expect(previewPath?.at(-1)?.[0]).toBe('Z');
  });
});
