import { describe, expect, it, vi } from 'vitest';

import {
  buildBrushColorControlProps,
  buildShapeColorControlProps,
  getShapePresetValue,
  getShapeStrokeWidthLabel,
} from './shared';

describe('brush-shape shared helpers', () => {
  it('builds brush color control props and forwards change callbacks', () => {
    const applyBrushPatch = vi.fn();
    const previewColor = vi.fn((setter: (value: string) => void, color: string) => setter(color));
    const updateColor = vi.fn((setter: (value: string) => void, color: string) => setter(color));
    const props = {
      applyBrushPatch,
      previewColor,
      recentColors: ['#aaa'],
      updateColor,
    };

    const controlProps = buildBrushColorControlProps(
      'pencil',
      props as never,
      {
        color: '#111111',
        opacity: 0.6,
        shapeCorrection: 'subtle',
        shadow: 0,
        smoothingLevel: 4,
        width: 12,
      },
      ['#111111', '#222222']
    );

    controlProps.onChange('#444444');
    controlProps.onPreviewChange('#555555');
    controlProps.onPreviewReset('#666666');

    expect(controlProps.palette).toEqual(['#111111', '#222222']);
    expect(controlProps.recentColors).toEqual(['#aaa']);
    expect(applyBrushPatch).toHaveBeenCalledWith('pencil', { color: '#444444' });
    expect(previewColor).toHaveBeenCalledTimes(2);
  });

  it('builds shape helper values for both filled and empty preset states', () => {
    expect(
      buildShapeColorControlProps('#111111', ['#aaa'], vi.fn(), vi.fn(), ['#111111'])
    ).toMatchObject({
      palette: ['#111111'],
      recentColors: ['#aaa'],
      value: '#111111',
    });
    expect(getShapeStrokeWidthLabel({ strokeWidth: 8 })).toBe('8px');
    expect(getShapePresetValue({ borderPresetId: 'preset-1' })).toBe('preset-1');
    expect(getShapePresetValue({ borderPresetId: null })).toBe('');
  });
});
