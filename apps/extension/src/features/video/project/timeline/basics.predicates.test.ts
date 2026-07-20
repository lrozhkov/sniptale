import { expect, it } from 'vitest';
import {
  clampClipPlaybackRate,
  getMediaClipSourceTime,
  getSourceTimedClipProjectDuration,
  getSourceTimedClipProjectOffset,
  getSourceTimedClipSourceOffset,
  getVideoClipSourceTime,
  isAudioClip,
  isClipActiveAtTime,
  isMediaClip,
  isVideoClip,
} from './basics';
import { createAudioClip, createImageClip, createVideoClip } from './project-meta.test.helpers.ts';

it('narrows clip kinds and resolves active/source time', () => {
  const videoClip = createVideoClip();
  const audioClip = createAudioClip();
  const imageClip = createImageClip();

  expect([videoClip, audioClip, imageClip].map(isMediaClip)).toEqual([true, true, true]);
  expect(isVideoClip(videoClip)).toBe(true);
  expect(isAudioClip(audioClip)).toBe(true);
  expect(isClipActiveAtTime(videoClip, 5)).toBe(true);
  expect(isClipActiveAtTime(videoClip, 10)).toBe(false);
  expect(getMediaClipSourceTime(videoClip, 100)).toBe(8);
  expect(getMediaClipSourceTime(audioClip, 1)).toBe(1);
  expect(getVideoClipSourceTime(videoClip, 7)).toBe(7);
  expect(clampClipPlaybackRate(8)).toBe(4);
  expect(getSourceTimedClipProjectDuration({ playbackRate: 2, sourceDuration: 6 })).toBe(3);
  expect(getSourceTimedClipProjectOffset({ playbackRate: 2, sourceDuration: 6 }, 4)).toBe(2);
  expect(getSourceTimedClipSourceOffset({ duration: 3, playbackRate: 2 }, 2.5)).toBe(5);
  expect(getSourceTimedClipSourceOffset({ duration: 3, playbackRate: 2 }, -1)).toBe(-2);
});
