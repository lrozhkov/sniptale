import { expect, it } from 'vitest';
import {
  buildColorOptions,
  getColorFromHue,
  getColorFromPlanePoint,
  getHueFromColor,
  getPlaneColor,
  getPlaneColorFromHue,
  getSaturationFromColor,
  getValueFromColor,
  hexToHsv,
  hexToRgb,
  hexToHsl,
  hslToHex,
  hsvToHex,
  normalizeColorSelectorValue,
  resolvePickerColor,
  updateHslChannel,
  updateRgbChannel,
} from './helpers';
import { clampRgbChannel, rgbToHex } from './normalize';

it('normalizes empty, transparent, short, long, and rgb color values', () => {
  expect(normalizeColorSelectorValue('')).toBeNull();
  expect(normalizeColorSelectorValue('transparent')).toBe('transparent');
  expect(normalizeColorSelectorValue('abc')).toBe('#aabbcc');
  expect(normalizeColorSelectorValue('#ABCDEF')).toBe('#abcdef');
  expect(normalizeColorSelectorValue('#12345600')).toBe('transparent');
  expect(normalizeColorSelectorValue('#123456ff')).toBe('#123456');
  expect(normalizeColorSelectorValue('rgb(12 34 56 / 0.5)')).toBe('#0c2238');
});

it('rejects invalid color strings', () => {
  expect(normalizeColorSelectorValue('bad color')).toBeNull();
  expect(normalizeColorSelectorValue('rgb(12 34)')).toBeNull();
});

it('converts normalized hex values into rgb channels and skips transparent', () => {
  expect(hexToRgb('#abcdef')).toEqual({ red: 171, green: 205, blue: 239 });
  expect(hexToRgb('transparent')).toBeNull();
  expect(clampRgbChannel(260.4)).toBe(255);
  expect(rgbToHex({ red: 12, green: 34, blue: 56 })).toBe('#0c2238');
});

it('builds bounded unique swatch options from committed colors only', () => {
  expect(buildColorOptions(['#ABCDEF', '#abcdef', 'transparent', '#123456', 'bad'], 2)).toEqual([
    '#abcdef',
    '#123456',
  ]);
});

it('falls back to the default picker color for transparent and invalid values', () => {
  expect(resolvePickerColor('transparent')).toBe('#f97316');
  expect(resolvePickerColor('not-a-color')).toBe('#f97316');
});

it('updates rgb channels safely and rejects invalid edits', () => {
  expect(updateRgbChannel('#112233', 'red', '200')).toBe('#c82233');
  expect(updateRgbChannel('#112233', 'green', '999')).toBe('#11ff33');
  expect(updateRgbChannel('#112233', 'blue', 'oops')).toBeNull();
  expect(updateRgbChannel('transparent', 'blue', '10')).toBeNull();
});

it('round-trips representative colors through HSL and clamps HSL channel edits', () => {
  expect(hslToHex(hexToHsl('#ff8800')!)).toBe('#ff8800');
  expect(updateHslChannel('#ff8800', 'hue', '999')).toMatch(/^#[0-9a-f]{6}$/);
  expect(updateHslChannel('#ff8800', 'saturation', '200')).toMatch(/^#[0-9a-f]{6}$/);
  expect(updateHslChannel('#ff8800', 'lightness', '-10')).toMatch(/^#[0-9a-f]{6}$/);
  expect(updateHslChannel('#ff8800', 'lightness', 'oops')).toBeNull();
});

it('derives hue, plane color, saturation, and value from the current color', () => {
  expect(getPlaneColor('#ff8800')).toMatch(/^#[0-9a-f]{6}$/);
  expect(getPlaneColorFromHue(240)).toBe('#0000ff');
  expect(getHueFromColor('#ff8800')).toBeGreaterThanOrEqual(0);
  expect(getHueFromColor('#ff8800')).toBeLessThanOrEqual(360);
  expect(getSaturationFromColor('#ff8800')).toBeGreaterThan(0);
  expect(getValueFromColor('#ff8800')).toBeGreaterThan(0);
  expect(getColorFromHue(240, '#ff8800')).toMatch(/^#[0-9a-f]{6}$/);
});

it('round-trips representative colors through HSV and clamps HSV helpers safely', () => {
  expect(hexToHsv('#808080')).toEqual({
    hue: 0,
    saturation: 0,
    value: 128 / 255,
  });
  expect(hexToHsv('transparent')).toBeNull();
  expect(hsvToHex({ hue: 120, saturation: 1, value: 1 })).toBe('#00ff00');
  expect(hsvToHex({ hue: 999, saturation: 2, value: -1 })).toBe('#000000');
});

it('maps plane coordinates back into bounded hex colors', () => {
  expect(
    getColorFromPlanePoint({
      hue: 120,
      left: 25,
      top: 10,
      width: 50,
      height: 20,
    })
  ).toMatch(/^#[0-9a-f]{6}$/);
});
