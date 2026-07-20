import { expect, it } from 'vitest';
import {
  getIncomingOffset,
  getTransitionIntensityMultiplier,
  getTransitionProgress,
  resolveDirectionalDistance,
} from './runtime';

function createRuntimeSegment() {
  const [leadingClip, trailingClip] = [
    createRuntimeClip('clip-a', 0, 'NONE', 'CROSSFADE'),
    createRuntimeClip('clip-b', 3, 'CROSSFADE', 'NONE'),
  ] as const;

  return {
    end: 4,
    id: 'transition-1',
    leadingClip,
    leadingClipId: 'clip-a',
    start: 3,
    trailingClip,
    trailingClipId: 'clip-b',
    transition: {
      duration: 1,
      easing: 'EASE_IN_OUT',
      id: 'transition-1',
      kind: 'PUSH',
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
  } as const;
}

function createRuntimeClip(
  id: string,
  startTime: number,
  transitionIn: 'NONE' | 'CROSSFADE',
  transitionOut: 'NONE' | 'CROSSFADE'
) {
  return {
    assetId: id === 'clip-a' ? 'asset-a' : 'asset-b',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id === 'clip-a' ? 'Clip A' : 'Clip B',
    sourceDuration: 4,
    sourceStart: 0,
    startTime,
    trackId: 'track-1',
    transform: { x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1 },
    transitionIn,
    transitionOut,
    type: 'VIDEO',
    volume: 1,
  };
}

it('resolves runtime helper math for intensity, progress, offsets, and clip distances', () => {
  const segment = createRuntimeSegment();

  expect(getTransitionIntensityMultiplier('SOFT')).toBeCloseTo(0.72);
  expect(getTransitionIntensityMultiplier('BALANCED')).toBe(1);
  expect(getTransitionIntensityMultiplier('BOLD')).toBeCloseTo(1.32);
  expect(getTransitionProgress(segment as never, 2.5)).toBeNull();
  expect(getTransitionProgress(segment as never, 3.5)).toBeCloseTo(0.5);
  expect(getIncomingOffset('LEFT', 100)).toEqual({ x: 100, y: 0 });
  expect(getIncomingOffset('UP', 40)).toEqual({ x: 0, y: 40 });
  expect(resolveDirectionalDistance(segment.leadingClip as never, 'RIGHT', 0.5)).toBe(640);
  expect(resolveDirectionalDistance(segment.leadingClip as never, 'DOWN', 0.25)).toBe(180);
});
