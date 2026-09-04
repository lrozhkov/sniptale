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
import { VideoProjectTrackRole, VideoTrackKind } from '../types/index';
import { resolveVideoProjectCameraTrackOrder } from '../camera/track-order';

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
  const tracks = createRecordingProjectTrackSet(defaultTracks, options.sidecarVideos ?? [], deps);
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
    tracks: tracks.allTracks.filter((track) => clips.some((clip) => clip.trackId === track.id)),
  });
}

function createDefaultProjectTracks(deps: RecordingProjectFactoryDeps): {
  audioTrack: VideoProjectTrack;
  primaryTrack: VideoProjectTrack;
} {
  return {
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
      false
    ),
  };
}

function createRecordingProjectTrackSet(
  defaultTracks: ReturnType<typeof createDefaultProjectTracks>,
  sidecarVideos: RecordingSidecarVideoProjectInput[],
  deps: RecordingProjectFactoryDeps
) {
  const sidecarTracks = sidecarVideos.map((sidecar, index) =>
    createRecordingSidecarTrack({
      deps,
      index: index + 1,
      ...(sidecar.trackRole ? { role: sidecar.trackRole } : {}),
      cameraIndex: sidecarVideos
        .slice(0, index)
        .filter((item) => item.trackRole === VideoProjectTrackRole.CAMERA).length,
      cameraCount: sidecarVideos.filter((item) => item.trackRole === VideoProjectTrackRole.CAMERA)
        .length,
    })
  );
  const sidecarAssetCount = sidecarVideos.length;
  const audioTrack =
    sidecarAssetCount === 0
      ? defaultTracks.audioTrack
      : deps.createVideoProjectTrack(
          deps.getDefaultTrackName(VideoTrackKind.AUDIO, 1),
          sidecarAssetCount + 2,
          VideoTrackKind.AUDIO,
          false
        );
  return {
    allTracks: [defaultTracks.primaryTrack, ...sidecarTracks, audioTrack],
    audioTrack,
    sidecarTracks,
  };
}

function createRecordingSidecarTrack(params: {
  cameraCount: number;
  cameraIndex: number;
  deps: RecordingProjectFactoryDeps;
  index: number;
  role?: VideoProjectTrackRole;
}): VideoProjectTrack {
  const track = params.deps.createVideoProjectTrack(
    params.deps.getDefaultTrackName(VideoTrackKind.PRIMARY, params.index + 1),
    params.role === VideoProjectTrackRole.CAMERA
      ? resolveVideoProjectCameraTrackOrder(params.cameraIndex, params.cameraCount)
      : params.index + 1,
    VideoTrackKind.PRIMARY,
    false
  );
  return params.role ? { ...track, role: params.role } : track;
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
        ...(params.sidecarTracks[index]?.role
          ? { trackRole: params.sidecarTracks[index].role }
          : {}),
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
