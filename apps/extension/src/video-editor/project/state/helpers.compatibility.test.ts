import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorProjectState } from './contracts';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';
import {
  applyProjectUpdate,
  ensureTrackForKind,
  isTrackCompatibleWithClip,
  pruneUnusedProjectAssets,
} from './helpers';

function createClip(
  id: string,
  type: VideoProjectClipType,
  trackId: string
): VideoProjectAudioClip | VideoProjectVideoClip {
  const clip = {
    assetId: 'asset-1',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: 'group-1',
    id,
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: id,
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
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

  return { ...clip, fitMode: VideoMediaFitMode.CONTAIN } as VideoProjectVideoClip;
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('Helper coverage');
  const [primaryTrack, audioTrack] = project.tracks;
  project.clips = [
    createClip('video-1', VideoProjectClipType.VIDEO, primaryTrack!.id),
    createClip('audio-1', VideoProjectClipType.AUDIO, audioTrack!.id),
  ];
  return project;
}

function createAsset(id: string): VideoProjectAsset {
  return {
    createdAt: 0,
    id,
    metadata: {
      audioPeaks: null,
      duration: 4,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name: id,
    source: { kind: 'recording', recordingId: id },
    type: VideoProjectAssetType.VIDEO,
  };
}

it('checks helper compatibility guards and asset pruning branches', () => {
  const project = createProject();
  const [videoClip, audioClip] = project.clips as [VideoProjectClip, VideoProjectClip];
  const subtitleResult = ensureTrackForKind(project, VideoTrackKind.SUBTITLE, null);
  const subtitleTrack = subtitleResult.project.tracks.find(
    (track) => track.kind === VideoTrackKind.SUBTITLE
  )!;

  expect(applyProjectUpdate({ project: null } as VideoEditorProjectState, () => project)).toEqual(
    {}
  );
  expect(isTrackCompatibleWithClip(project.tracks[0]!, videoClip)).toBe(true);
  expect(isTrackCompatibleWithClip(project.tracks[1]!, videoClip)).toBe(false);
  expect(isTrackCompatibleWithClip(project.tracks[1]!, audioClip)).toBe(true);
  expect(isTrackCompatibleWithClip(subtitleTrack, videoClip)).toBe(false);

  const withAssets = { ...project, assets: [createAsset('asset-1'), createAsset('asset-2')] };
  expect(pruneUnusedProjectAssets(withAssets).assets.map((asset) => asset.id)).toEqual(['asset-1']);
  expect(pruneUnusedProjectAssets(project)).toBe(project);
});
