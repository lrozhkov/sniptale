import { describe, expect, it } from 'vitest';

import { applyCanvasShadow, createFabricShadow } from './shadow';

function registerDefaultShadowTest() {
  it('preserves the default downward shadow and supports directional offsets', () => {
    const down = createFabricShadow(100, '#112233');
    const left = createFabricShadow(100, '#112233', { angle: 180 });
    const detached = createFabricShadow(100, '#112233', { affectStroke: false });

    expect(down).toMatchObject({ affectStroke: true, blur: 16, offsetX: 0, offsetY: 2 });
    expect(left).toMatchObject({ affectStroke: true, blur: 16, offsetX: -2, offsetY: 0 });
    expect(detached).toMatchObject({ affectStroke: false, blur: 16 });
  });
}

function registerDisabledShadowTest() {
  it('keeps disabled and transparent shadows empty', () => {
    expect(createFabricShadow(0, '#112233')).toBeUndefined();
    expect(createFabricShadow(100, 'transparent')).toBeUndefined();
  });
}

function registerCustomShadowValuesTest() {
  it('uses canonical size, distance, blur, and angle values when provided', () => {
    const shadow = createFabricShadow(40, '#112233', {
      angle: 0,
      blur: 12,
      distance: 8,
    });

    expect(shadow).toMatchObject({
      blur: 12,
      color: 'rgba(17, 34, 51, 0.4)',
      offsetX: 8,
      offsetY: 0,
    });
  });
}

function registerCanvasShadowTest() {
  it('applies directional canvas shadows with disabled fallbacks', () => {
    const context = {
      shadowBlur: 0,
      shadowColor: '',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D;

    applyCanvasShadow(context, 100, '#112233', { angle: 180 });
    expect(context).toMatchObject({ shadowBlur: 16, shadowOffsetX: -2, shadowOffsetY: 0 });

    applyCanvasShadow(context, 0, '#112233');
    expect(context).toMatchObject({
      shadowBlur: 0,
      shadowColor: 'transparent',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    });
  });
}

describe('editor Fabric shadow factory', () => {
  registerDefaultShadowTest();
  registerDisabledShadowTest();
  registerCustomShadowValuesTest();
  registerCanvasShadowTest();
});
