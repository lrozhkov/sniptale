import { expect, it } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../features/video/project/factories/creation';
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
  areClipTracksEditable,
  ensureTrackForKind,
  isTrackCompatibleWithClip,
} from './helpers';
import { resetVideoEditorProjectHistory } from '../history';

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
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
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

it('checks helper compatibility guards', () => {
  const project = createProject();
  const [videoClip, audioClip] = project.clips as [VideoProjectClip, VideoProjectClip];
  const subtitleResult = ensureTrackForKind(project, VideoTrackKind.SUBTITLE, null);
  const subtitleTrack = subtitleResult.project.tracks.find(
    (track) => track.kind === VideoTrackKind.SUBTITLE
  )!;

  expect(applyProjectUpdate({ project: null } as VideoEditorProjectState, () => project)).toEqual(
    {}
  );
  expect(
    applyProjectUpdate(
      {
        project,
        projectHistory: resetVideoEditorProjectHistory(project.id),
      } as VideoEditorProjectState,
      (currentProject) => currentProject
    )
  ).toEqual({});
  expect(isTrackCompatibleWithClip(project.tracks[0]!, videoClip)).toBe(true);
  expect(isTrackCompatibleWithClip(project.tracks[1]!, videoClip)).toBe(false);
  expect(isTrackCompatibleWithClip(project.tracks[1]!, audioClip)).toBe(true);
  expect(isTrackCompatibleWithClip(project.tracks[0]!, audioClip)).toBe(false);
  expect(isTrackCompatibleWithClip(subtitleTrack, videoClip)).toBe(false);
  const subtitleClip = {
    ...videoClip,
    text: 'Subtitle',
    type: VideoProjectClipType.SUBTITLE,
  } as VideoProjectClip;
  expect(isTrackCompatibleWithClip(subtitleTrack, subtitleClip)).toBe(true);
  expect(isTrackCompatibleWithClip(project.tracks[0]!, subtitleClip)).toBe(false);
  expect(areClipTracksEditable(project, ['video-1', 'audio-1'])).toBe(true);
  const lockedLinkedProject = {
    ...project,
    tracks: project.tracks.map((track) =>
      track.id === project.tracks[1]!.id ? { ...track, locked: true } : track
    ),
  };
  expect(areClipTracksEditable(lockedLinkedProject, ['video-1', 'audio-1'])).toBe(false);
  expect(areClipTracksEditable(project, ['missing'])).toBe(false);
});

it('records source-anchor reprojection in the same project history action', () => {
  const project = createProject();
  project.baseRecordingId = 'recording-1';
  project.assets = [
    {
      ...createAsset('asset-1'),
      source: { kind: 'recording', recordingId: 'recording-1' },
      type: VideoProjectAssetType.RECORDING,
    },
  ];
  project.actionEvents = [
    {
      data: {},
      duration: 0,
      id: 'anchored-action',
      kind: 'CLICK',
      label: 'Click',
      point: null,
      preset: 'CLICK_RIPPLE',
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: 'recording-1',
        sourceClipId: 'video-1',
        sourceTime: 1,
      },
      time: 1,
    },
  ];
  const state = {
    currentTime: 0,
    placementMode: null,
    project,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    selection: { kind: 'scene' },
    selectedTrackId: project.tracks[0]!.id,
  } as VideoEditorProjectState;

  const update = applyProjectUpdate(state, (currentProject) => ({
    ...currentProject,
    clips: currentProject.clips.map((clip) => ({ ...clip, startTime: 3 })),
  }));

  expect(update.project?.actionEvents[0]?.time).toBe(4);
  expect(update.projectHistory?.past).toHaveLength(1);
  expect(update.projectHistory?.past[0]?.actionEvents[0]?.time).toBe(1);
});
