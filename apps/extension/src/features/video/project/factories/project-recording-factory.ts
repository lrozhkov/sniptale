import {
  createRecordingAudioClip,
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from './recording';
import {
  createRecordingSidecarAssets,
  createRecordingSidecarClip,
  type RecordingSidecarVideoProjectInput,
} from './recording-sidecar';
import { createRecordingProjectDocument } from './project-recording';
import type {
  VideoProject,
  VideoProjectActionEvent,
  VideoProjectAsset,
  VideoProjectClip,
  VideoProjectCursorTrack,
  VideoProjectTrack,
} from '../types/index';
import { VideoTrackKind } from '../types/index';

export type CreateVideoProjectFromRecordingOptions = {
  recordingId: string;
  filename: string;
  width: number;
  height: number;
  duration: number;
  mimeType: string;
  size: number;
  hasAudio?: boolean;
  audioPeaks?: number[] | null;
  actionEvents?: VideoProjectActionEvent[];
  cursorTrack?: VideoProjectCursorTrack | null;
  motionRegions?: VideoProject['motionRegions'];
  asset?: VideoProjectAsset;
  sidecarVideos?: RecordingSidecarVideoProjectInput[];
};

type RecordingProjectFactoryDeps = {
  createClipGroupId: () => string;
  createVideoProjectTrack: (
    name: string,
    order: number,
    kind: VideoTrackKind,
    isRoot?: boolean
  ) => VideoProjectTrack;
  getDefaultTrackName: (kind: VideoTrackKind, index?: number) => string;
};

export function createRecordingVideoProject(
  options: CreateVideoProjectFromRecordingOptions,
  deps: RecordingProjectFactoryDeps
): VideoProject {
  const defaultTracks = createDefaultProjectTracks(deps);
  const asset = options.asset ?? createRecordingProjectAsset(options);
  const sidecarAssets = createRecordingSidecarAssets(options.sidecarVideos);
  const tracks = createRecordingProjectTrackSet(defaultTracks, sidecarAssets.length, deps);
  const normalizedDuration = Math.max(0.1, options.duration);
  const clips = createRecordingProjectClipSet({
    asset,
    audioTrack: tracks.audioTrack,
    defaultTracks,
    deps,
    normalizedDuration,
    options,
    sidecarAssets,
    sidecarTracks: tracks.sidecarTracks,
  });
  return createRecordingProjectDocument({
    actionEvents: options.actionEvents ?? [],
    asset,
    clips,
    cursorTrack: options.cursorTrack ?? null,
    motionRegions: options.motionRegions ?? [],
    options,
    sidecarAssets,
    tracks: tracks.allTracks,
  });
}

function createDefaultProjectTracks(deps: RecordingProjectFactoryDeps): {
  audioTrack: VideoProjectTrack;
  overlayTrack: VideoProjectTrack;
  primaryTrack: VideoProjectTrack;
} {
  return {
    overlayTrack: deps.createVideoProjectTrack(
      deps.getDefaultTrackName(VideoTrackKind.OVERLAY, 1),
      0,
      VideoTrackKind.OVERLAY,
      true
    ),
    primaryTrack: deps.createVideoProjectTrack(
      deps.getDefaultTrackName(VideoTrackKind.PRIMARY, 1),
      1,
      VideoTrackKind.PRIMARY,
      true
    ),
    audioTrack: deps.createVideoProjectTrack(
      deps.getDefaultTrackName(VideoTrackKind.AUDIO, 1),
      2,
      VideoTrackKind.AUDIO,
      true
    ),
  };
}

function createRecordingProjectTrackSet(
  defaultTracks: ReturnType<typeof createDefaultProjectTracks>,
  sidecarAssetCount: number,
  deps: RecordingProjectFactoryDeps
) {
  const sidecarTracks = Array.from({ length: sidecarAssetCount }, (_asset, index) =>
    createRecordingSidecarTrack(index + 1, deps)
  );
  const audioTrack =
    sidecarAssetCount === 0
      ? defaultTracks.audioTrack
      : deps.createVideoProjectTrack(
          deps.getDefaultTrackName(VideoTrackKind.AUDIO, 1),
          sidecarAssetCount + 2,
          VideoTrackKind.AUDIO,
          true
        );
  return {
    allTracks: [
      defaultTracks.primaryTrack,
      ...sidecarTracks,
      audioTrack,
      defaultTracks.overlayTrack,
    ],
    audioTrack,
    sidecarTracks,
  };
}

function createRecordingSidecarTrack(
  index: number,
  deps: RecordingProjectFactoryDeps
): VideoProjectTrack {
  return deps.createVideoProjectTrack(
    deps.getDefaultTrackName(VideoTrackKind.PRIMARY, index + 1),
    index + 1,
    VideoTrackKind.PRIMARY,
    false
  );
}

function createRecordingProjectClipSet(params: {
  asset: VideoProjectAsset;
  audioTrack: VideoProjectTrack;
  defaultTracks: ReturnType<typeof createDefaultProjectTracks>;
  deps: RecordingProjectFactoryDeps;
  normalizedDuration: number;
  options: CreateVideoProjectFromRecordingOptions;
  sidecarAssets: VideoProjectAsset[];
  sidecarTracks: VideoProjectTrack[];
}) {
  return [
    ...createRecordingProjectClips({
      asset: params.asset,
      audioTrackId: params.audioTrack.id,
      deps: params.deps,
      normalizedDuration: params.normalizedDuration,
      options: params.options,
      primaryTrackId: params.defaultTracks.primaryTrack.id,
    }),
    ...params.sidecarAssets.map((sidecarAsset, index) =>
      createRecordingSidecarClip({
        asset: sidecarAsset,
        projectHeight: params.options.height,
        projectWidth: params.options.width,
        trackId: params.sidecarTracks[index]?.id ?? params.defaultTracks.primaryTrack.id,
      })
    ),
  ];
}

function createRecordingProjectClips(params: {
  asset: VideoProjectAsset;
  audioTrackId: string;
  deps: RecordingProjectFactoryDeps;
  normalizedDuration: number;
  options: CreateVideoProjectFromRecordingOptions;
  primaryTrackId: string;
}) {
  const groupId = params.asset.metadata.hasAudio ? params.deps.createClipGroupId() : null;
  const clips: VideoProjectClip[] = [
    createRecordingBaseClip(params.asset, params.options, params.primaryTrackId, groupId),
  ];
  if (params.asset.metadata.hasAudio && groupId) {
    clips.push(
      createRecordingAudioClip(
        params.asset,
        params.audioTrackId,
        params.normalizedDuration,
        groupId
      )
    );
  }

  return clips;
}
