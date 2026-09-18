import { expect, it } from 'vitest';
import {
  clampQuickEditAudioClip,
  createQuickEditAudioClip,
  resolveOriginalAudioPlayback,
  trimQuickEditAudioClip,
  updateQuickEditAudioClip,
} from './audio';

it('creates clips at the playhead bounded by the timeline end', () => {
  expect(
    createQuickEditAudioClip({
      id: 'a1',
      assetId: 'asset:1',
      timelineStart: 2,
      duration: 5,
      endMax: 10,
    })
  ).toEqual({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 2,
    sourceOffset: 0,
    duration: 5,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  });
  const nearEnd = createQuickEditAudioClip({
    id: 'a2',
    assetId: 'asset:1',
    timelineStart: 9,
    duration: 5,
    endMax: 10,
  });
  expect(nearEnd.timelineStart).toBe(9);
  expect(nearEnd.duration).toBe(1);
});

it('clamps patches and keeps the clip inside the timeline', () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 1,
    duration: 2,
    endMax: 10,
  });
  expect(updateQuickEditAudioClip(clip, { volume: 5 }).volume).toBe(2);
  expect(updateQuickEditAudioClip(clip, { volume: -1 }).volume).toBe(0);
  expect(updateQuickEditAudioClip(clip, { fadeIn: 100 }).fadeIn).toBe(60);
  expect(updateQuickEditAudioClip(clip, { sourceOffset: -3 }).sourceOffset).toBe(0);
  expect(clampQuickEditAudioClip({ ...clip, timelineStart: 11 }, 10).timelineStart).toBeLessThan(
    10
  );
  const clamped = clampQuickEditAudioClip({ ...clip, timelineStart: 9, duration: 5 }, 10);
  expect(clamped.timelineStart).toBe(9);
  expect(clamped.duration).toBe(1);
});

it('trims edges without leaving the asset window or the timeline', () => {
  const clip = createQuickEditAudioClip({
    id: 'a1',
    assetId: 'asset:1',
    timelineStart: 2,
    duration: 4,
    endMax: 10,
  });
  const trimmedLeft = trimQuickEditAudioClip(clip, 'start', 3, 10);
  expect(trimmedLeft.timelineStart).toBe(3);
  expect(trimmedLeft.sourceOffset).toBe(1);
  expect(trimmedLeft.duration).toBe(3);
  const trimmedRight = trimQuickEditAudioClip(clip, 'end', 4, 10);
  expect(trimmedRight.duration).toBe(2);
  expect(trimmedRight.sourceOffset).toBe(0);
  const collapsed = trimQuickEditAudioClip(clip, 'start', 10, 10);
  expect(collapsed.duration).toBeGreaterThanOrEqual(0.001);
  expect(clampQuickEditAudioClip(trimmedRight, 3).duration).toBe(1);
});

it('merges speed muting with the original audio gate for preview and export', () => {
  expect(resolveOriginalAudioPlayback({ muted: false, volume: 0.4 }, false)).toEqual({
    muted: false,
    volume: 0.4,
  });
  expect(resolveOriginalAudioPlayback({ muted: false, volume: 1 }, true).muted).toBe(true);
  expect(resolveOriginalAudioPlayback({ muted: true, volume: 1 }, false).muted).toBe(true);
});
