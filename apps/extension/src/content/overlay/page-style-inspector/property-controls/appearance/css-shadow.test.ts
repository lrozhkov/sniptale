import { describe, expect, it } from 'vitest';
import {
  createDefaultBoxShadow,
  parseCssBoxShadow,
  resolveCssBoxShadow,
  serializeCssBoxShadow,
} from './css-shadow';

describe('css shadow helpers', () => {
  it('parses box shadow lengths and keeps the remaining value as color', () => {
    expect(parseCssBoxShadow('0 8px 18px 0 rgba(0, 0, 0, 0.2)')).toEqual({
      blur: '18px',
      color: 'rgba(0, 0, 0, 0.2)',
      spread: '0px',
      x: '0px',
      y: '8px',
    });
  });

  it('normalizes none and unsupported values for the structured field', () => {
    expect(resolveCssBoxShadow('none').mode).toBe('none');
    expect(resolveCssBoxShadow('inset 0 0 4px red').mode).toBe('unsupported');
  });

  it('serializes the structured shadow model in CSS order', () => {
    expect(serializeCssBoxShadow(createDefaultBoxShadow())).toBe(
      '0px 8px 18px 0px rgba(0, 0, 0, 0.2)'
    );
  });
});
