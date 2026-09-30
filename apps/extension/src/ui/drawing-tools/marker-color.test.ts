import { expect, it } from 'vitest';
import { markerColorAtOpacity, markerColorPatch, markerVisibleColor } from './marker-color';

it('shows the effective alpha of old and new marker colors', () => {
  expect(markerVisibleColor('#ffff00', 0.3)).toBe('#ffff004d');
  expect(markerVisibleColor('#ffff0080', 0.6)).toBe('#ffff004d');
  expect(markerVisibleColor('#ffff0000', 1)).toBe('#ffff0000');
  expect(markerVisibleColor('#ffff00', 1)).toBe('#ffff00');
});

it('writes marker picker and preset changes with one effective alpha channel', () => {
  expect(markerColorPatch('#12345680')).toEqual({ color: '#12345680', opacity: 1 });
  expect(markerColorAtOpacity('#12345680', 0)).toEqual({ color: '#12345600', opacity: 1 });
  expect(markerColorAtOpacity('#12345600', 1)).toEqual({ color: '#123456', opacity: 1 });
});

it('retains malformed legacy colors when calculating an effective preview', () => {
  expect(markerVisibleColor('legacy-color', 0.3)).toBe('legacy-color');
  expect(markerColorAtOpacity('legacy-color', 0.6)).toEqual({
    color: 'legacy-color',
    opacity: 1,
  });
});
