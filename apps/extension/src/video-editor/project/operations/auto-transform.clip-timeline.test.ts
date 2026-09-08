import type { VideoProjectVideoClip } from '../../../features/video/project/types';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { expect, it } from 'vitest';
import {
  createAudioClip,
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import {
  applyAutoProcessingTiming,
  type AutoProcessingTimingRequest,
} from './auto-transform.clip-timeline';
function fixture() {
  const project = createProject(
    [
      createVideoClip({
        id: 'screen',
        sourceInstanceId: 'instance',
        startTime: 10,
        groupId: 'linked',
        linkMode: 'LINKED',
      }),
      createAudioClip({ id: 'audio', startTime: 10, groupId: 'linked', linkMode: 'LINKED' }),
      createVideoClip({ id: 'repeat', sourceInstanceId: 'repeat-instance', startTime: 22 }),
      createVideoClip({
        id: 'other',
        assetId: 'other-asset',
        sourceInstanceId: 'other-instance',
        startTime: 35,
      }),
    ],
    [createTrack('track-video', 0), createTrack('track-audio', 1)]
  );
  project.assets.push({
    ...project.assets[0]!,
    id: 'other-asset',
    source: { kind: 'recording', recordingId: 'other-recording' },
  });
  project.duration = 43;
  return project;
}
function speed(clipId = 'screen', sourceInstanceId = 'instance'): AutoProcessingTimingRequest {
  return {
    id: clipId,
    target: { clipId, sourceInstanceId, recordingId: 'rec-asset-video' },
    action: VideoAutoProcessingAction.SPEED_UP,
    sourceStart: 2,
    sourceEnd: 6,
    playbackRate: 2,
  };
}
it('changes only the selected placement, preserving repeat source timing, linked audio and original gaps', () => {
  const project = fixture();
  const result = applyAutoProcessingTiming(project, [speed()]);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  expect(
    result.project.clips
      .filter(
        (clip): clip is VideoProjectVideoClip =>
          clip.type === 'VIDEO' && clip.sourceInstanceId === 'instance'
      )
      .map((clip) => [
        clip.startTime,
        clip.sourceStart,
        clip.sourceDuration,
        clip.playbackRate ?? 1,
      ])
      .sort((a, b) => a[0]! - b[0]!)
  ).toEqual([
    [10, 0, 2, 1],
    [12, 2, 4, 2],
    [14, 6, 2, 1],
  ]);
  expect(result.project.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    startTime: 20,
    sourceStart: 0,
    sourceDuration: 8,
    duration: 8,
  });
  expect(result.project.clips.find((clip) => clip.id === 'other')).toMatchObject({
    startTime: 33,
    sourceStart: 0,
    sourceDuration: 8,
    duration: 8,
  });
  expect(
    result.project.clips
      .filter((clip) => clip.type === 'AUDIO')
      .map((clip) => clip.duration)
      .sort()
  ).toEqual([2, 2, 2]);
  expect(project.clips).toHaveLength(4);
});
it('processes both repeated placements only when explicitly selected', () => {
  const result = applyAutoProcessingTiming(fixture(), [
    speed(),
    speed('repeat', 'repeat-instance'),
  ]);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  expect(
    result.project.clips.filter((clip) => clip.type === 'VIDEO' && clip.playbackRate === 2)
  ).toHaveLength(2);
  expect(result.project.clips.find((clip) => clip.id === 'other')?.startTime).toBe(31);
});
it('discards the complete batch if a selected later step is locked', () => {
  const project = fixture();
  project.tracks.push({ ...createTrack('locked', 2), locked: true });
  project.clips.find((clip) => clip.id === 'repeat')!.trackId = 'locked';
  const before = structuredClone(project);
  expect(
    applyAutoProcessingTiming(project, [speed(), speed('repeat', 'repeat-instance')])
  ).toMatchObject({ status: 'blocked' });
  expect(project).toEqual(before);
});
it('removes only the selected source interval and retains the repeat', () => {
  const result = applyAutoProcessingTiming(fixture(), [
    { ...speed(), action: VideoAutoProcessingAction.REMOVE },
  ]);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  expect(
    result.project.clips
      .filter(
        (clip): clip is VideoProjectVideoClip =>
          clip.type === 'VIDEO' && clip.sourceInstanceId === 'instance'
      )
      .map((clip) => [clip.sourceStart, clip.sourceDuration])
      .sort((a, b) => a[0]! - b[0]!)
  ).toEqual([
    [0, 2],
    [6, 2],
  ]);
  expect(result.project.clips.find((clip) => clip.id === 'repeat')).toMatchObject({
    startTime: 18,
    duration: 8,
  });
});
it('handles disjoint source intervals through the surviving original clip identity', () => {
  const project = fixture();
  const result = applyAutoProcessingTiming(project, [
    { ...speed(), sourceStart: 1, sourceEnd: 2 },
    { ...speed(), sourceStart: 5, sourceEnd: 6 },
  ]);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error(result.reason);
  expect(
    result.project.clips
      .filter(
        (clip): clip is VideoProjectVideoClip => clip.type === 'VIDEO' && clip.playbackRate === 2
      )
      .map((clip) => clip.sourceStart)
      .sort()
  ).toEqual([1, 5]);
});
