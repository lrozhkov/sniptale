import { expect, it } from 'vitest';

import { getDefaultCursorHidden, normalizeVideoProjectCursorSkin } from './cursor';
import { VideoCursorAnimationPreset, VideoCursorVisualPreset } from './types/index';

it('normalizes cursor skins and clamps scale into the supported range', () => {
  expect(
    normalizeVideoProjectCursorSkin({
      color: '',
      hidden: 1 as never,
      scale: 10,
      shadow: 0 as never,
    })
  ).toEqual({
    animationPreset: VideoCursorAnimationPreset.NONE,
    color: '#f8fafc',
    hidden: true,
    preset: VideoCursorVisualPreset.ARROW,
    scale: 4,
    shadow: false,
  });
});

it('hides embedded fallback cursor tracks by default and shows separate tracks', () => {
  expect(getDefaultCursorHidden('embedded-fallback')).toBe(true);
  expect(getDefaultCursorHidden('separate')).toBe(false);
});
