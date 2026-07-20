import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoEditorProjectState } from './contracts';
import {
  applyProjectUpdate,
  areClipTracksEditable,
  ensureTrackForKind,
  isSourceTimedClip,
  isTrackCompatibleWithClip,
  resolveEditableClipOperation,
} from './helpers';

function createProjectState(): VideoEditorProjectState {
  const project = createEmptyVideoProject('Helpers');

  return {
    currentTime: 1,
    project,
    selection: { kind: VideoEditorSelectionKind.SCENE },
    selectedClipId: null,
    selectedTrackId: project.tracks[0]?.id ?? null,
  } as VideoEditorProjectState;
}

function createVideoClip(trackId: string) {
  return {
    id: 'video-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Video',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: 'CONTAIN',
    sourceStart: 0,
    sourceDuration: 4,
  } as const;
}

function createAudioClip(trackId: string) {
  return {
    id: 'audio-1',
    trackId,
    type: VideoProjectClipType.AUDIO,
    name: 'Audio',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    sourceStart: 0,
    sourceDuration: 4,
  } as const;
}

it('returns an empty patch when applying a project update without an active project', () => {
  expect(
    applyProjectUpdate(
      {
        currentTime: 1,
        project: null,
        selection: { kind: VideoEditorSelectionKind.SCENE },
        selectedClipId: null,
        selectedTrackId: null,
      } as VideoEditorProjectState,
      (project) => project
    )
  ).toEqual({});
});

it('falls back from an incompatible preferred track and creates missing kinds', () => {
  const project = createEmptyVideoProject('Helpers');
  const fallback = ensureTrackForKind(project, VideoTrackKind.PRIMARY, project.tracks[1]!.id);
  const created = ensureTrackForKind(
    {
      ...project,
      tracks: project.tracks.filter((track) => track.kind !== VideoTrackKind.OVERLAY),
    },
    VideoTrackKind.OVERLAY,
    project.tracks[0]!.id
  );

  expect(fallback.trackId).toBe(project.tracks[0]!.id);
  expect(created.project.tracks.some((track) => track.kind === VideoTrackKind.OVERLAY)).toBe(true);
});

it('rejects missing and mismatched editable clip operations', () => {
  const state = createProjectState();
  const project = {
    ...state.project!,
    clips: [createVideoClip(state.project!.tracks[0]!.id)],
  };

  expect(resolveEditableClipOperation(project, 'missing')).toBeNull();
  expect(
    resolveEditableClipOperation(
      project,
      'video-1',
      (clip): clip is ReturnType<typeof createAudioClip> => clip.type === VideoProjectClipType.AUDIO
    )
  ).toBeNull();
});

it('reports source timing and track compatibility for video and audio clips', () => {
  const state = createProjectState();
  const primaryTrack = state.project!.tracks[0]!;
  const audioTrack = state.project!.tracks[1]!;
  const videoClip = createVideoClip(primaryTrack.id);
  const audioClip = createAudioClip(audioTrack.id);

  expect(isSourceTimedClip(videoClip)).toBe(true);
  expect(isSourceTimedClip(audioClip)).toBe(true);
  expect(isTrackCompatibleWithClip(primaryTrack, videoClip)).toBe(true);
  expect(isTrackCompatibleWithClip(audioTrack, videoClip)).toBe(false);
  expect(isTrackCompatibleWithClip(audioTrack, audioClip)).toBe(true);
  expect(isTrackCompatibleWithClip(primaryTrack, audioClip)).toBe(false);
});

it('treats missing clips or missing tracks as non-editable', () => {
  const state = createProjectState();
  const project = {
    ...state.project!,
    assets: [
      {
        id: 'asset-1',
        type: VideoProjectAssetType.VIDEO,
        name: 'Video',
        source: { kind: 'project-asset' as const, projectAssetId: 'asset-1' },
        metadata: {
          width: 1280,
          height: 720,
          duration: 4,
          mimeType: 'video/mp4',
          size: 10,
          hasAudio: true,
          audioPeaks: null,
        },
        createdAt: 1,
      },
    ],
    clips: [createVideoClip(state.project!.tracks[0]!.id)],
  };
  const missingTrackProject = {
    ...project,
    tracks: [],
  };

  expect(areClipTracksEditable(project, ['missing'])).toBe(false);
  expect(areClipTracksEditable(missingTrackProject, ['video-1'])).toBe(false);
});
