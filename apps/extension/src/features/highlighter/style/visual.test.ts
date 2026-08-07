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
    opacity: 75,
    strokeOpacity: 50,
    fillColor: '#445566',
    fillOpacity: 25,
    inheritCustomCss: true,
    customCss: 'outline: 1px solid red;',
    ...overrides,
  };
}

describe('highlighter visual preset resolver', () => {
  it('normalizes legacy fields and resolves independent stroke and fill visuals', () => {
    const visual = resolveBorderPresetVisual(
      createPreset({
        strokeOpacity: undefined as never,
        fillColor: undefined as never,
        fillOpacity: undefined as never,
        inheritCustomCss: undefined as never,
      })
    );

    expect(visual).toMatchObject({
      strokeColor: '#112233',
      strokeOpacity: 75,
      fillColor: '#00000000',
      fillOpacity: 0,
      inheritCustomCss: false,
      customCssStyles: {},
    });
    expect(colorToRgba('#112233', 50)).toBe('rgba(17, 34, 51, 0.5)');
  });

  it('keeps non-hex colors and normalizes short and alpha hex colors', () => {
    expect(colorToRgba('transparent', 75)).toBe('transparent');
    expect(colorToRgba('#abc', 50)).toBe('rgba(170, 187, 204, 0.5)');
    expect(colorToRgba('#abcd', 50)).toBe('rgba(170, 187, 204, 0.5)');
    expect(colorToRgba('#11223344', 50)).toBe('rgba(17, 34, 51, 0.5)');
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
