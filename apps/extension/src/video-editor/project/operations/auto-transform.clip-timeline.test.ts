import { describe, expect, it } from 'vitest';
import { VideoClipLinkMode } from '../../../features/video/project/types/model';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import {
  createAudioClip,
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers.ts';
import {
  applyAutoTransformClipTimeline,
  mapSourceTimeToProjectTime,
} from './auto-transform.clip-timeline';

function createRecordingProject() {
  return createProject(
    [
      createVideoClip({
        duration: 8,
        groupId: 'group-1',
        id: 'clip-video',
        linkMode: VideoClipLinkMode.LINKED,
        playbackRate: 1,
        sourceDuration: 8,
        sourceStart: 0,
        startTime: 0,
        trackId: 'track-video',
      }),
      createAudioClip({
        duration: 8,
        groupId: 'group-1',
        id: 'clip-audio',
        linkMode: VideoClipLinkMode.LINKED,
        playbackRate: 1,
        sourceDuration: 8,
        sourceStart: 0,
        startTime: 0,
        trackId: 'track-audio',
      }),
    ],
    [createTrack('track-video', 0), createTrack('track-audio', 1)]
  );
}

function verifyRetimedClipTimeline() {
  const project = createRecordingProject();
  const result = applyAutoTransformClipTimeline(project, 'rec-asset-video', [
    {
      action: VideoAutoProcessingAction.SPEED_UP,
      endTime: 6,
      playbackRate: 2,
      startTime: 2,
    },
  ]);
  const videoClips = result.clips
    .filter((clip) => clip.type === 'VIDEO')
    .sort((left, right) => left.startTime - right.startTime);
  const audioClips = result.clips
    .filter((clip) => clip.type === 'AUDIO')
    .sort((left, right) => left.startTime - right.startTime);

  expect(videoClips).toHaveLength(3);
  expect(audioClips).toHaveLength(3);
  expect(videoClips.map((clip) => clip.startTime)).toEqual([0, 2, 4]);
  expect(videoClips.map((clip) => clip.duration)).toEqual([2, 2, 2]);
  expect(
    videoClips.map((clip) => ('playbackRate' in clip ? (clip.playbackRate ?? 1) : null))
  ).toEqual([1, 2, 1]);
  expect(
    audioClips.every(
      (clip, index) =>
        clip.startTime === videoClips[index]?.startTime &&
        clip.groupId === videoClips[index]?.groupId
    )
  ).toBe(true);
}

describe('auto transform clip timeline', () => {
  it('splits linked recording clips on source boundaries, retimes target ranges, and compacts project time', () => {
    verifyRetimedClipTimeline();
  });

  it('maps source time back onto compacted project time after retiming', () => {
    const project = applyAutoTransformClipTimeline(createRecordingProject(), 'rec-asset-video', [
      {
        action: VideoAutoProcessingAction.SPEED_UP,
        endTime: 6,
        playbackRate: 2,
        startTime: 2,
      },
    ]);

    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 1)).toBe(1);
    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 3)).toBe(2.5);
    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 7)).toBe(5);
    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 20)).toBeNull();
  });

  it('removes selected source ranges and drops source-time mappings inside the cut', () => {
    const project = applyAutoTransformClipTimeline(createRecordingProject(), 'rec-asset-video', [
      {
        action: VideoAutoProcessingAction.REMOVE,
        endTime: 6,
        playbackRate: 2,
        startTime: 2,
      },
    ]);
    const videoClips = project.clips
      .filter((clip) => clip.type === 'VIDEO')
      .sort((left, right) => left.startTime - right.startTime);

    expect(videoClips).toHaveLength(2);
    expect(videoClips.map((clip) => clip.startTime)).toEqual([0, 2]);
    expect(videoClips.map((clip) => clip.sourceStart)).toEqual([0, 6]);
    expect(project.duration).toBe(4);
    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 3)).toBeNull();
    expect(mapSourceTimeToProjectTime(project, 'rec-asset-video', 7)).toBe(3);
  });
});
