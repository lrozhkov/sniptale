import { describe, expect, it, vi } from 'vitest';

import { BORDER_SHADOW_SOFT_INTENSITY } from './shadow';
import type { BorderPreset } from '@sniptale/ui/highlighter-style/types';
import { colorToRgba, resolveBorderPresetVisual } from './visual';

vi.mock('../css-sanitizer/css', () => ({
  validateCssPolicyString: vi.fn(() => ({ blockedProps: [], properties: [], rawError: false })),
  validateCssString: vi.fn((css: string) => ({
    blockedProps: css.includes('position') ? ['position'] : [],
    hasBlockedProps: css.includes('position'),
    rawError: null,
    styles: css.includes('geometry-escape')
      ? {
          all: 'unset',
          backgroundImage: 'linear-gradient(red, blue)',
          border: '20px dashed blue',
          borderRadius: '50px',
          boxShadow: '0 0 4px red',
          clip: 'rect(0, 0, 0, 0)',
          inset: '0',
          offsetPath: 'path("M 0 0 L 100 100")',
          WebkitClipPath: 'inset(10px)',
          WebkitMask: 'linear-gradient(black, transparent)',
          WebkitTransform: 'scale(2)',
          zIndex: '999',
          zoom: '2',
        }
      : { outline: '1px solid red' },
  })),
}));

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: 'preset',
    name: 'Preset',
    order: 0,
    width: 4,
    color: '#112233',
    style: 'dashed',
    radius: 8,
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
    shadow: BORDER_SHADOW_SOFT_INTENSITY,
    fillPaint: { kind: 'solid' as const, color: '#445566' },
    inheritCustomCss: true,
    customCss: 'outline: 1px solid red;',
    ...overrides,
  };
}

describe('highlighter visual preset resolver', () => {
  it('resolves independent canonical stroke and fill visuals', () => {
    const visual = resolveBorderPresetVisual(createPreset());

    expect(visual).toMatchObject({
      strokeColor: '#112233',
      fillColor: '#445566ff',
      fillCss: '#445566ff',
      inheritCustomCss: true,
      customCssStyles: { outline: '1px solid red' },
    });
    expect(colorToRgba('#112233', 50)).toBe('rgba(17, 34, 51, 0.5)');
  });

  it('rejects malformed Paint from a typed canonical producer', () => {
    expect(() =>
      resolveBorderPresetVisual(
        createPreset({ fillPaint: { kind: 'solid' as const, color: undefined as never } })
      )
    ).toThrow('invalid canonical Paint');
  });

  it('keeps non-hex colors and normalizes short and alpha hex colors', () => {
    expect(colorToRgba('transparent', 75)).toBe('transparent');
    expect(colorToRgba('#abc', 50)).toBe('rgba(170, 187, 204, 0.5)');
    expect(colorToRgba('#abcd', 50)).toBe('rgba(170, 187, 204, 0.4333)');
    expect(colorToRgba('#11223344', 50)).toBe('rgba(17, 34, 51, 0.1333)');
  });

  it('applies sanitized custom css only when inheritance is enabled and valid', () => {
    expect(resolveBorderPresetVisual(createPreset()).customCssStyles).toEqual({
      outline: '1px solid red',
    });
    expect(
      resolveBorderPresetVisual(createPreset({ customCss: 'position: fixed;' })).customCssStyles
    ).toEqual({});
    expect(
      resolveBorderPresetVisual(createPreset({ inheritCustomCss: false })).customCssStyles
    ).toEqual({});
  });

  it('projects accepted custom css to decoration-only properties', () => {
    expect(
      resolveBorderPresetVisual(createPreset({ customCss: 'geometry-escape' })).customCssStyles
    ).toEqual({
      backgroundImage: 'linear-gradient(red, blue)',
      boxShadow: '0 0 4px red',
    });
  });
});
