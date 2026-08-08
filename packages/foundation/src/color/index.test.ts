import { describe, expect, it } from 'vitest';
import {
  formatHexColor,
  getColorAlpha,
  hasVisibleColor,
  multiplyColorAlpha,
  normalizeColor,
  parseColor,
  replaceColorChannels,
  setColorAlpha,
} from '.';

describe('foundation color', () => {
  it.each([
    ['#abc', '#aabbcc'],
    ['abcd', '#aabbccdd'],
    ['rgba(255, 0, 128, 0.5)', '#ff008080'],
    ['rgb(100% 0% 50% / 25%)', '#ff008040'],
    ['hsl(120, 100%, 50%, 0.5)', '#00ff0080'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeColor(input)).toBe(expected);
  });

  it('keeps semantic transparent distinct from zero-alpha paint', () => {
    expect(normalizeColor('transparent')).toBe('transparent');
    expect(normalizeColor('#12345600')).toBe('#12345600');
    expect(hasVisibleColor('transparent')).toBe(false);
    expect(hasVisibleColor('#12345600')).toBe(false);
  });

  it('multiplies rather than replaces existing alpha', () => {
    expect(multiplyColorAlpha('#33669980', 0.5)).toBe('#33669940');
    expect(multiplyColorAlpha('transparent', 1)).toBe('transparent');
    expect(getColorAlpha('#33669980')).toBeCloseTo(128 / 255);
  });

  it('replaces alpha and channels independently', () => {
    expect(setColorAlpha('#336699', 0.25)).toBe('#33669940');
    expect(replaceColorChannels('#33669940', '#ff0000')).toBe('#ff000040');
  });

  it('rejects invalid colors and emits opaque hex without an alpha suffix', () => {
    expect(parseColor('var(--unsafe)')).toBeNull();
    expect(normalizeColor('nope')).toBeNull();
    expect(formatHexColor({ red: 1, green: 2, blue: 3, alpha: 1 })).toBe('#010203');
  });
});
