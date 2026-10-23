import { expect, it } from 'vitest';
import { evaluateCompositionJoin, parseCompositionJoinSettings } from './composition-join';

it.each([1, 1_000_000])('preserves the same seam profile on a clock scaled by %s', (unit) => {
  const sample = (time: number, before = 1, after = 2) =>
    evaluateCompositionJoin(time * unit, 3 * unit, before * unit, after * unit);
  expect(sample(1.99)).toBeNull();
  expect(sample(2)).toEqual({ incoming: 0, beforeSeam: true, black: 0 });
  expect(sample(2.5)).toEqual({ incoming: 1 / 6, beforeSeam: true, black: 0.5 });
  expect(sample(3)).toEqual({ incoming: 1 / 3, beforeSeam: false, black: 1 });
  expect(sample(4)).toEqual({ incoming: 2 / 3, beforeSeam: false, black: 0.5 });
  expect(sample(5)).toBeNull();
  expect(sample(3, 0, 2)).toEqual({ incoming: 0, beforeSeam: false, black: 1 });
  expect(sample(4, 0, 2)).toEqual({ incoming: 0.5, beforeSeam: false, black: 0.5 });
  expect(sample(2.5, 1, 0)).toEqual({ incoming: 0.5, beforeSeam: true, black: 0.5 });
  expect(sample(3, 1, 0)).toBeNull();
  expect(sample(3, 0, 0)).toBeNull();
});

it.each([1, 24_000 / 1001, 30_000 / 1001, 60_000 / 1001, 120])(
  'evaluates rational output samples without quantizing their clock at %s fps',
  (fps) => {
    const seam = 2;
    const before = 0.4;
    const after = 0.15;
    for (let tick = 0; tick <= Math.ceil(3 * fps); tick++) {
      const time = Math.round((tick * 1_000_000) / fps);
      const actual = evaluateCompositionJoin(
        time,
        seam * 1_000_000,
        before * 1_000_000,
        after * 1_000_000
      );
      const local = time / 1_000_000;
      if (local < seam - before || local >= seam + after) {
        expect(actual).toBeNull();
        continue;
      }
      expect(actual?.incoming).toBeCloseTo((local - seam + before) / (before + after), 12);
      expect(actual?.black).toBeCloseTo(
        local < seam ? (local - seam + before) / before : (seam + after - local) / after,
        12
      );
      expect(actual?.beforeSeam).toBe(local < seam);
    }
  }
);

it.each([NaN, -Infinity, Infinity])('does not select a seam for a nonfinite query %s', (time) => {
  expect(evaluateCompositionJoin(time, 3, 1, 2)).toBeNull();
});

it('preserves authored join transition timing and optional opaque color', () => {
  expect(parseCompositionJoinSettings({ type: 'dissolve', before: 0.2, after: 0.3 })).toEqual({
    type: 'dissolve',
    before: 0.2,
    after: 0.3,
  });
  expect(
    parseCompositionJoinSettings({ type: 'fade-black', before: 0, after: 1, color: '#ff0000ff' })
  ).toEqual({ type: 'fade-black', before: 0, after: 1, color: '#ff0000ff' });
});
it.each([
  null,
  {},
  { type: 'dissolve', before: -1, after: 2 },
  { type: 'dissolve', before: 0, after: 0 },
  { type: 'dissolve', before: 30, after: 31 },
  { type: 'dissolve', before: NaN, after: 1 },
  { type: 'fade-black', before: 1, after: 1, color: '#ffffff00' },
])('rejects unsupported transition %j', (raw) => {
  expect(parseCompositionJoinSettings(raw)).toBeNull();
});
