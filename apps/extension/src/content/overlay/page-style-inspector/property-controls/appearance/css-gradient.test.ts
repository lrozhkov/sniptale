import { describe, expect, it } from 'vitest';
import {
  createDefaultLinearGradient,
  parseCssLinearGradient,
  resolveCssGradient,
  serializeCssLinearGradient,
} from './css-gradient';

describe('css gradient helpers', () => {
  it('parses linear gradients with angle and color stops', () => {
    expect(parseCssLinearGradient('linear-gradient(135deg, #fff 0%, #111 100%)')).toEqual({
      angle: 135,
      from: '#fff',
      to: '#111',
    });
  });

  it('keeps commas inside color functions when parsing color stops', () => {
    expect(
      parseCssLinearGradient('linear-gradient(90deg, rgba(255, 0, 0, .5) 0%, #000 100%)')
    ).toEqual({
      angle: 90,
      from: 'rgba(255, 0, 0, .5)',
      to: '#000',
    });
  });

  it('normalizes unsupported and none values for the structured field', () => {
    expect(resolveCssGradient('none').mode).toBe('none');
    expect(resolveCssGradient('radial-gradient(circle, red, blue)').mode).toBe('unsupported');
    expect(resolveCssGradient('linear-gradient(90deg, red, green, blue)').mode).toBe('unsupported');
  });

  it('serializes blank gradient parts with defaults', () => {
    expect(serializeCssLinearGradient({ angle: -90, from: '', to: '' })).toBe(
      'linear-gradient(270deg, #ffffff 0%, #000000 100%)'
    );
    expect(createDefaultLinearGradient()).toEqual({
      angle: 90,
      from: '#ffffff',
      to: '#000000',
    });
  });
});
