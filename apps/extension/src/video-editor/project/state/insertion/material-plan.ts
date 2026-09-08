import {
  createClipGroupId,
  createVideoProjectTrack,
  getDefaultTrackName,
} from '../../../../features/video/project/factories/creation';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../../features/video/project/factories/clip';
import { createRecordingSidecarClip } from '../../../../features/video/project/factories/recording-sidecar';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { DEFAULT_IMAGE_CLIP_DURATION } from '../../../../features/video/project/defaults';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoProjectTrackRole,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectClip,
  type VideoProjectTrack,
} from '../../../../features/video/project/types';
import type { VideoEditorMaterialSourceRange } from '../../../contracts/insertion';
import type { AddAssetClipResult } from '../asset-shared';

/** Only timed media has an In/Out interval; a selection must contain at least one frame. */
export function isMaterialSourceRangeValid(
  asset: VideoProjectAsset,
  range: VideoEditorMaterialSourceRange,
  fps: number
): boolean {
  return (
    asset.type !== VideoProjectAssetType.IMAGE &&
    asset.metadata.duration !== null &&
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.start >= 0 &&
    range.end <= asset.metadata.duration &&
    range.end - range.start + 1e-9 >= 1 / fps
  );
}

function getMaterialParts(project: VideoProject, asset: VideoProjectAsset) {
  if (asset.recordingPart?.role !== 'primary') return [asset];
  const recordingId = asset.recordingPart.recordingId;
  return [
    asset,
    ...project.assets.filter(
      (candidate) =>
        candidate.id !== asset.id &&
        candidate.recordingPart?.recordingId === recordingId &&
        candidate.recordingPart.role !== 'primary'
    ),
  ];
}

function hasEmbeddedAudio(asset: VideoProjectAsset) {
  return (
    asset.type !== VideoProjectAssetType.AUDIO &&
    asset.type !== VideoProjectAssetType.IMAGE &&
    asset.metadata.hasAudio
  );
}

function resolveMaterialTrack(params: {
  project: VideoProject;
  tracks: VideoProjectTrack[];
  claimed: Set<string>;
  asset: VideoProjectAsset;
  kind: VideoTrackKind;
  mode: 'append' | 'overlay';
  primary: boolean;
  preferredTrackId?: string | null;
}) {
  const { project, tracks, claimed, asset, kind, mode, primary } = params;
  const camera = kind === VideoTrackKind.PRIMARY && asset.recordingPart?.role === 'camera';
  const available = tracks.filter(
    (track) =>
      track.kind === kind &&
      !claimed.has(track.id) &&
      (track.role === VideoProjectTrackRole.CAMERA) === camera
  );
  const preferred = primary
    ? available.find((track) => track.id === params.preferredTrackId)
    : undefined;
  const previous = available.find((track) =>
    project.clips.some(
      (clip) => clip.trackId === track.id && 'assetId' in clip && clip.assetId === asset.id
    )
  );
  const existing =
    preferred ??
    (primary && !camera && kind === VideoTrackKind.PRIMARY
      ? (available.find((track) => track.isRoot) ?? available[0])
      : (previous ?? available.find((track) => !track.isRoot)));
  if (mode === 'append' && existing) {
    claimed.add(existing.id);
    return existing;
  }
  const order =
    kind === VideoTrackKind.AUDIO || (!primary && !camera) || (mode === 'append' && !camera)
      ? Math.max(0, ...tracks.map((track) => track.order)) + 1
      : Math.min(0, ...tracks.map((track) => track.order)) - 1;
  const track = createVideoProjectTrack(
    getDefaultTrackName(kind, tracks.filter((item) => item.kind === kind).length + 1),
    order,
    kind
  );
  if (camera) track.role = VideoProjectTrackRole.CAMERA;
  tracks.push(track);
  claimed.add(track.id);
  return track;
}

function createMaterialClip(params: {
  asset: VideoProjectAsset;
  project: VideoProject;
  track: VideoProjectTrack;
  time: number;
  groupId: string | null;
  range: VideoEditorMaterialSourceRange;
}): VideoProjectClip {
  const { asset, project, track, time, groupId, range } = params;
  const duration = range.end - range.start;
  const clip =
    track.kind === VideoTrackKind.AUDIO
      ? createAudioClipFromAsset(track.id, asset, time, { groupId })
      : asset.recordingPart && asset.recordingPart.role !== 'primary'
        ? createRecordingSidecarClip({
            asset,
            projectWidth: project.width,
            projectHeight: project.height,
            trackId: track.id,
            ...(track.role ? { trackRole: track.role } : {}),
            startTime: time,
            sourceStart: range.start,
            duration,
            groupId,
          })
        : createVideoClipFromAsset(track.id, asset, project.width, project.height, time, {
            groupId,
            muted: hasEmbeddedAudio(asset) || Boolean(asset.recordingPart),
          });
  return clip.type === VideoProjectClipType.VIDEO || clip.type === VideoProjectClipType.AUDIO
    ? { ...clip, duration, sourceStart: range.start, sourceDuration: duration }
    : clip;
}

/** Resolves source composition and receiving tracks before the placement owner commits once. */
export function buildMaterialPlacement(
  project: VideoProject,
  asset: VideoProjectAsset,
  time: number,
  mode: 'append' | 'overlay',
  sourceRange?: VideoEditorMaterialSourceRange,
  preferredTrackId?: string | null
): AddAssetClipResult {
  const range = sourceRange ?? {
    start: 0,
    end: Math.max(0.1, asset.metadata.duration ?? DEFAULT_IMAGE_CLIP_DURATION),
  };
  const parts = getMaterialParts(project, asset).filter(
    (part) => part.id === asset.id || (part.metadata.duration ?? 0) > range.start
  );
  const groupId = parts.length > 1 || parts.some(hasEmbeddedAudio) ? createClipGroupId() : null;
  const tracks = [...project.tracks];
  const clips = [...project.clips];
  const claimed = new Set<string>();
  let selectedClipId: string | null = null;
  let selectedTrackId: string | null = null;
  for (const part of parts) {
    const partRange = {
      start: range.start,
      end:
        part.id === asset.id ? range.end : Math.min(range.end, part.metadata.duration ?? range.end),
    };
    const kinds =
      part.type === VideoProjectAssetType.AUDIO
        ? [VideoTrackKind.AUDIO]
        : hasEmbeddedAudio(part)
          ? [VideoTrackKind.PRIMARY, VideoTrackKind.AUDIO]
          : [VideoTrackKind.PRIMARY];
    for (const kind of kinds) {
      const track = resolveMaterialTrack({
        project,
        tracks,
        claimed,
        asset: part,
        kind,
        mode,
        primary: part.id === asset.id,
        ...(preferredTrackId ? { preferredTrackId } : {}),
      });
      const clip = createMaterialClip({
        project,
        asset: part,
        track,
        time,
        groupId,
        range: partRange,
      });
      clips.push(clip);
      selectedClipId ??= clip.id;
      selectedTrackId ??= track.id;
    }
  }
  return {
    project: applyVideoProjectMutationPatch(project, { clips, tracks }),
    selectedClipId,
    selectedTrackId,
  };
}
