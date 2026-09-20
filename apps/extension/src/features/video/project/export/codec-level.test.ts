import { expect, it } from 'vitest';
import { resolveVideoCodecLevel } from './codec-level';
it.each([
  [1920, 1080, 30, '28'],
  [1920, 1080, 60, '2a'],
  [3840, 2160, 60, '34'],
])('resolves AVC level for %sx%s at %s fps', (width, height, fps, level) => {
  expect(
    resolveVideoCodecLevel('avc1.640028', {
      width: Number(width),
      height: Number(height),
      fps: Number(fps),
    })
  ).toBe('avc1.6400' + level);
});
it('keeps HEVC frame-rate limits and leaves other codec families unchanged', () => {
  expect(resolveVideoCodecLevel('hvc1.1.6.L123.B0', { width: 3840, height: 2160, fps: 60 })).toBe(
    'hvc1.1.6.L153.B0'
  );
  expect(resolveVideoCodecLevel('vp8', { width: 1920, height: 1080, fps: 60 })).toBe('vp8');
});
