import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoMediaFitMode } from '../../../features/video/project/types/media';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectAudioClip,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types/model';
import {
  collectRecordingSourceUnits,
  collectRepresentativeRecordingSourceClips,
  getSourceEnd,
  getSourceUnitKey,
  isRecordingSourceTimedClip,
  updateSourceTimedClipTiming,
} from './source-timed-clips';
import type { SourceTimedClip } from './source-timed-clips';

function createClip(id: string, type: VideoProjectClipType, trackId: string): SourceTimedClip {
  const clip = {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: 'group-1',
    id,
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: id,
    sourceDuration: 4,
    sourceStart: id === 'clip-2' ? 4 : 0,
    startTime: id === 'clip-2' ? 4 : 0,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type,
    volume: 1,
  };

  if (type === VideoProjectClipType.AUDIO) {
    return clip as VideoProjectAudioClip;
  }

  return {
    ...clip,
    fitMode: VideoMediaFitMode.CONTAIN,
  } as VideoProjectVideoClip;
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('Source timed clips');
  const [primaryTrack, audioTrack] = project.tracks;
  project.assets = [createRecordingAsset()];
  project.clips = [
    createClip('clip-1', VideoProjectClipType.VIDEO, primaryTrack!.id),
    createClip('clip-2', VideoProjectClipType.VIDEO, primaryTrack!.id),
    createClip('audio-1', VideoProjectClipType.AUDIO, audioTrack!.id),
  ];
  return project;
}

function createRecordingAsset(): VideoProjectAsset {
  return {
    createdAt: 0,
    id: 'asset-1',
    metadata: {
      audioPeaks: null,
      duration: 10,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name: 'Recording',
    source: { kind: 'recording', recordingId: 'recording-1' },
    type: VideoProjectAssetType.VIDEO,
  };
}

it('normalizes source-timed clips and groups recording source units', () => {
  const project = createProject();
  const clip = project.clips[0]!;

  expect(isRecordingSourceTimedClip(project, clip, 'recording-1')).toBe(true);
  expect(getSourceEnd(clip as SourceTimedClip)).toBe(4);
  expect(getSourceUnitKey(clip as SourceTimedClip)).toBe('group-1');
  expect(updateSourceTimedClipTiming(clip as SourceTimedClip, { playbackRate: 2 })).toEqual(
    expect.objectContaining({ duration: 2, playbackRate: 2 })
  );
  expect(collectRecordingSourceUnits(project, 'recording-1')).toHaveLength(1);
  expect(collectRepresentativeRecordingSourceClips(project, 'recording-1')[0]?.type).toBe(
    VideoProjectClipType.VIDEO
  );
});
