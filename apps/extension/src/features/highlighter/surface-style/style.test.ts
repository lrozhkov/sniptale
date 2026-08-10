import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { areSurfaceStylesEqual, cloneSurfaceStyle, parseSurfaceStyle } from './style';

it('parses, clones, and compares semantic Surface Style snapshots', () => {
  const style = { fillPaint: createSolidPaint('#fff'), surfaceCss: 'color:#000;' };
  const clone = cloneSurfaceStyle(style);
  expect(clone).not.toBe(style);
  expect(clone.fillPaint).not.toBe(style.fillPaint);
  expect(clone.surfaceCss).toBe('color: #000;');
  expect(areSurfaceStylesEqual(style, clone)).toBe(true);
  expect(parseSurfaceStyle({ ...style, fillPaint: { kind: 'wat' } })).toBeNull();
});
