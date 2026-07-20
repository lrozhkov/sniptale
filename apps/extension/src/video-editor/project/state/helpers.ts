import {
  createVideoProjectTrack,
  getDefaultTrackName,
} from '../../../features/video/project/factories/creation';
import { clampNumber } from '../../../features/video/project/hydration';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { getLinkedClipIds, syncProjectDuration } from '../../../features/video/project/timeline';
import type { VideoProject, VideoProjectClip } from '../../../features/video/project/types/index';
import {
  VideoClipLinkMode,
  VideoProjectClipType,
  VideoTrackKind,
} from '../../../features/video/project/types/index';
import {
  resolvePlacementModeAfterProjectUpdate,
  resolvePlacementModeAfterSelectionChange,
} from '../selection/placement';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import { isSourceTimedClip, updateSourceTimedClipTiming } from '../operations/source-timed-clips';
import type { VideoEditorProjectState } from './contracts';
import {
  resolveSelectedTrackIdFromSelection,
  resolveSelectionAfterProjectUpdate,
} from './selection';

export { isSourceTimedClip, updateSourceTimedClipTiming };

interface EditableClipOperation<TClip extends VideoProjectClip = VideoProjectClip> {
  clip: TClip;
  clipIds: string[];
  clipIdSet: Set<string>;
  affectedClips: VideoProjectClip[];
}

export function ensureTrackForKind(
  project: VideoProject,
  kind: VideoTrackKind,
  preferredTrackId?: string | null
): { project: VideoProject; trackId: string } {
  if (preferredTrackId) {
    const preferred = project.tracks.find(
      (track) => track.id === preferredTrackId && track.kind === kind
    );
    if (preferred) {
      return { project, trackId: preferred.id };
    }
  }

  const existing = project.tracks.find((track) => track.kind === kind);
  if (existing) {
    return { project, trackId: existing.id };
  }

  const sequence = project.tracks.filter((track) => track.kind === kind).length + 1;
  const track = createVideoProjectTrack(
    getDefaultTrackName(kind, sequence),
    project.tracks.length,
    kind
  );
  return {
    project: applyVideoProjectMutationPatch(project, {
      tracks: [...project.tracks, track],
    }),
    trackId: track.id,
  };
}

export function applyProjectUpdate(
  state: VideoEditorProjectState,
  updater: (project: VideoProject) => VideoProject
): Partial<VideoEditorProjectState> {
  if (!state.project) {
    return {};
  }

  const nextProject = syncProjectDuration(updater(state.project));
  const nextTime = clampNumber(state.currentTime, 0, Math.max(0, nextProject.duration));
  const selectedClipStillExists = state.selectedClipId
    ? nextProject.clips.some((clip) => clip.id === state.selectedClipId)
    : false;
  const selectedTrackStillExists = state.selectedTrackId
    ? nextProject.tracks.some((track) => track.id === state.selectedTrackId)
    : false;
  const selection = resolveSelectionAfterProjectUpdate(nextProject, state.selection);
  const selectedClipId = resolveSelectedClipId(selection);
  const selectedTrackId =
    resolveSelectedTrackIdFromSelection(nextProject, selection) ??
    (selectedTrackStillExists ? state.selectedTrackId : (nextProject.tracks[0]?.id ?? null));
  const placementMode = resolvePlacementModeAfterProjectUpdate(
    nextProject,
    resolvePlacementModeAfterSelectionChange(selection, state.placementMode)
  );

  return {
    project: nextProject,
    currentTime: nextTime,
    placementMode,
    selection,
    selectedClipId: selectedClipStillExists ? selectedClipId : null,
    selectedTrackId,
  };
}

function resolveSelectedClipId(selection: VideoEditorProjectState['selection']): string | null {
  return selection.kind === VideoEditorSelectionKind.CLIP ? selection.clipId : null;
}

export function getClipOperationIds(project: VideoProject, clipId: string): string[] {
  const ids = getLinkedClipIds(project, clipId);
  return ids.length > 0 ? ids : [clipId];
}

export function resolveEditableClipOperation(
  project: VideoProject,
  clipId: string
): EditableClipOperation | null;
export function resolveEditableClipOperation<TClip extends VideoProjectClip>(
  project: VideoProject,
  clipId: string,
  guard: (clip: VideoProjectClip) => clip is TClip
): EditableClipOperation<TClip> | null;
export function resolveEditableClipOperation<TClip extends VideoProjectClip>(
  project: VideoProject,
  clipId: string,
  guard?: (clip: VideoProjectClip) => clip is TClip
): EditableClipOperation<TClip> | EditableClipOperation | null {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!clip || (guard && !guard(clip))) {
    return null;
  }

  const clipIds = getClipOperationIds(project, clipId);
  if (!areClipTracksEditable(project, clipIds)) {
    return null;
  }

  return {
    clip,
    clipIds,
    clipIdSet: new Set(clipIds),
    affectedClips: project.clips.filter((item) => clipIds.includes(item.id)),
  };
}

export function isTrackCompatibleWithClip(
  track: VideoProject['tracks'][number],
  clip: VideoProjectClip
): boolean {
  if (clip.type === VideoProjectClipType.AUDIO) {
    return track.kind === VideoTrackKind.AUDIO;
  }

  if (clip.type === VideoProjectClipType.SUBTITLE) {
    return track.kind === VideoTrackKind.SUBTITLE;
  }

  if (track.kind === VideoTrackKind.SUBTITLE) {
    return false;
  }

  return track.kind !== VideoTrackKind.AUDIO;
}

export function areClipTracksEditable(project: VideoProject, clipIds: string[]): boolean {
  return clipIds.every((clipId) => {
    const clip = project.clips.find((item) => item.id === clipId);
    if (!clip) {
      return false;
    }

    const track = project.tracks.find((item) => item.id === clip.trackId);
    return Boolean(track && !track.locked);
  });
}

export function detachLinkedClips(project: VideoProject, clipId: string): VideoProject {
  const operation = resolveEditableClipOperation(project, clipId);
  if (!operation) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((clip) =>
      operation.clipIdSet.has(clip.id)
        ? {
            ...clip,
            groupId: null,
            linkMode: VideoClipLinkMode.DETACHED,
          }
        : clip
    ),
  });
}

export function pruneUnusedProjectAssets(project: VideoProject): VideoProject {
  const referencedAssetIds = new Set(project.clips.flatMap(collectClipAssetIds));
  const nextAssets = project.assets.filter((asset) => referencedAssetIds.has(asset.id));

  if (nextAssets.length === project.assets.length) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    assets: nextAssets,
  });
}

function collectClipAssetIds(clip: VideoProjectClip): string[] {
  const assetIds = 'assetId' in clip ? [clip.assetId] : [];
  if (clip.type === VideoProjectClipType.SHAPE && clip.embeddedAsset) {
    assetIds.push(clip.embeddedAsset.assetId);
  }

  return assetIds;
}
