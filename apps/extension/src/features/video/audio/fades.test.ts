import { expect, it } from 'vitest';
import { buildAudioFadeEnvelope, getAudioFadeFactor, getAudioFadeLimitSeconds } from './fades';

it.each([
  [0, 0],
  [4, 4],
  [80, 60],
  [-1, 0],
  [Infinity, 0],
  [NaN, 0],
])('bounds authoring duration %s to %s', (duration, limit) => {
  expect(getAudioFadeLimitSeconds(duration)).toBe(limit);
});
it('preserves the exact minimum ramp across every interval and resume point', () => {
  for (const duration of [0.1, 4, 120])
    for (const fadeIn of [0, duration / 4, duration * 0.75, duration * 2])
      for (const fadeOut of [0, duration / 4, duration * 0.75, duration * 2]) {
        for (const rate of [0.5, 1, 2]) {
          const phase = { duration, fadeIn, fadeOut };
          const offset = duration / 10;
          const intervalDuration = (duration - offset) / rate;
          const elapsed = intervalDuration / 5;
          const points = buildAudioFadeEnvelope({
            ...phase,
            offset,
            rate,
            intervalDuration,
            elapsed,
          });
          expect(points[0]?.[0]).toBe(elapsed);
          expect(points.at(-1)?.[0]).toBe(intervalDuration);
          for (let i = 1; i < points.length; i++) {
            const [from, a] = points[i - 1]!;
            const [to, b] = points[i]!;
            expect(to).toBeGreaterThan(from);
            for (const part of [0, 0.25, 0.5, 0.75, 1]) {
              const local = from + part * (to - from);
              const time = offset + local * rate;
              const expected = Math.max(
                0,
                Math.min(
                  1,
                  fadeIn > 0 ? time / fadeIn : 1,
                  fadeOut > 0 ? (duration - time) / fadeOut : 1
                )
              );
              expect(Math.abs(a + part * (b - a) - expected)).toBeLessThan(1e-12);
              expect(getAudioFadeFactor(phase, time)).toBeCloseTo(expected, 12);
            }
          }
        }
      }
});
it('includes the non-integer crossing and retains a no-fade end', () => {
  expect(
    buildAudioFadeEnvelope({
      duration: 4,
      intervalDuration: 4,
      elapsed: 0,
      fadeIn: 3,
      fadeOut: 2,
    }).find(([time]) => time === 2.4)?.[1]
  ).toBeCloseTo(0.8, 12);
  expect(
    buildAudioFadeEnvelope({ duration: 4, intervalDuration: 4, elapsed: 2, fadeIn: 0, fadeOut: 0 })
  ).toEqual([
    [2, 1],
    [4, 1],
  ]);
});
