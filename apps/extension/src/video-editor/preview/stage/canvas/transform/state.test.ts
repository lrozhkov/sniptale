import { expect, it } from 'vitest';
import type { VideoProjectTransform } from '../../../../../features/video/project/types';
import { createPreviewTransformGestureState, hasCrossedPreviewTransformThreshold } from './state';

const TRANSFORM: VideoProjectTransform = {
  height: 40,
  opacity: 1,
  rotation: 0,
  width: 60,
  x: 10,
  y: 20,
};

it('uses a two CSS-pixel activation threshold', () => {
  const origin = { clientX: 10, clientY: 20 };

  expect(hasCrossedPreviewTransformThreshold(origin, { clientX: 11, clientY: 21 })).toBe(false);
  expect(hasCrossedPreviewTransformThreshold(origin, { clientX: 12, clientY: 20 })).toBe(true);
});

it('starts with an authoritative transform and no disposable patch', () => {
  const state = createPreviewTransformGestureState({
    clipId: 'clip-1',
    origin: { clientX: 10, clientY: 20 },
    transform: TRANSFORM,
  });

  expect(state).toMatchObject({ activated: false, clipId: 'clip-1', previewTransform: null });
  expect(state.authoritativeTransform).toEqual(TRANSFORM);
  expect(state.authoritativeTransform).not.toBe(TRANSFORM);
});
