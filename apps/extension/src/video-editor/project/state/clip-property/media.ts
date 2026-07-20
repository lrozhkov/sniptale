import {
  normalizeVideoMediaShadowIntensity,
  normalizeVideoMediaShadowMode,
} from '../../../../features/video/composition/canvas/media-shadow';
import { resolveMediaClipTransformForFitMode } from '../../../../features/video/project/factories/clip';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getAssetById } from '../../../../features/video/project/timeline';
import {
  VideoProjectClipType,
  type VideoMediaFitMode,
  type VideoMediaShadowMode,
  type VideoProject,
  type VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate, areClipTracksEditable } from '../helpers';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;
type MediaClip = Extract<VideoProjectClip, { assetId: string; fitMode: VideoMediaFitMode }>;

export function createClipMediaStyleActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  | 'updateMediaClipFitMode'
  | 'updateMediaClipFitScalePercent'
  | 'updateMediaClipShadowIntensity'
  | 'updateMediaClipShadowMode'
  | 'applyMediaClipVisualsToTrack'
> {
  return {
    updateMediaClipFitMode: (clipId, fitMode) =>
      set((state) =>
        applyProjectUpdate(state, (project) => updateMediaClipVisuals(project, clipId, { fitMode }))
      ),
    updateMediaClipFitScalePercent: (clipId, fitScalePercent) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { fitScalePercent })
        )
      ),
    updateMediaClipShadowIntensity: (clipId, shadowIntensity) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { shadowIntensity })
        )
      ),
    updateMediaClipShadowMode: (clipId, shadowMode) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { shadowMode })
        )
      ),
    applyMediaClipVisualsToTrack: (clipId) =>
      set((state) =>
        applyProjectUpdate(state, (project) => applyMediaClipVisualsToTrack(project, clipId))
      ),
  };
}

function isMediaClip(clip: VideoProjectClip | undefined): clip is MediaClip {
  return clip?.type === VideoProjectClipType.VIDEO || clip?.type === VideoProjectClipType.IMAGE;
}

function resolveMediaClipFitTransform(
  project: VideoProject,
  clip: MediaClip,
  fitMode: VideoMediaFitMode,
  fitScalePercent: number
) {
  const asset = getAssetById(project, clip.assetId);
  if (!asset || asset.metadata.width <= 0 || asset.metadata.height <= 0) {
    return clip.transform;
  }

  return resolveMediaClipTransformForFitMode(
    asset.metadata.width,
    asset.metadata.height,
    project.width,
    project.height,
    fitMode,
    fitScalePercent
  );
}

function updateMediaClipVisuals(
  project: VideoProject,
  clipId: string,
  patch: {
    fitMode?: VideoMediaFitMode;
    fitScalePercent?: number;
    shadowIntensity?: number;
    shadowMode?: VideoMediaShadowMode;
  }
) {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!isMediaClip(clip) || !areClipTracksEditable(project, [clipId])) {
    return project;
  }

  const fitMode = patch.fitMode ?? clip.fitMode;
  const fitScalePercent =
    patch.fitScalePercent === undefined
      ? normalizeMediaFitScalePercent(clip.fitScalePercent ?? 100)
      : normalizeMediaFitScalePercent(patch.fitScalePercent, clip.fitScalePercent ?? 100);
  const shadowIntensity =
    patch.shadowIntensity === undefined
      ? normalizeVideoMediaShadowIntensity(clip.shadowIntensity)
      : normalizeVideoMediaShadowIntensity(patch.shadowIntensity);
  const shadowMode =
    patch.shadowMode === undefined
      ? normalizeVideoMediaShadowMode(clip.shadowMode)
      : normalizeVideoMediaShadowMode(patch.shadowMode);
  const shouldRefreshTransform = patch.fitMode !== undefined || patch.fitScalePercent !== undefined;

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      item.id === clipId && isMediaClip(item)
        ? {
            ...item,
            fitMode,
            fitScalePercent,
            shadowIntensity,
            shadowMode,
            transform: shouldRefreshTransform
              ? resolveMediaClipFitTransform(project, item, fitMode, fitScalePercent)
              : item.transform,
          }
        : item
    ),
  });
}

function normalizeMediaFitScalePercent(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) {
    return Number.isFinite(fallback)
      ? clampVideoPropertyNumber(fallback, VIDEO_CLIP_PROPERTY_LIMITS.fitScalePercent)
      : 100;
  }

  return clampVideoPropertyNumber(value, VIDEO_CLIP_PROPERTY_LIMITS.fitScalePercent);
}

function applyMediaClipVisualsToTrack(project: VideoProject, clipId: string) {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!isMediaClip(clip)) {
    return project;
  }

  const trackClipIds = project.clips
    .filter((item) => item.trackId === clip.trackId && isMediaClip(item))
    .map((item) => item.id);
  if (!areClipTracksEditable(project, trackClipIds)) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      item.trackId === clip.trackId && isMediaClip(item)
        ? {
            ...item,
            fitMode: clip.fitMode,
            fitScalePercent: clip.fitScalePercent ?? 100,
            shadowIntensity: normalizeVideoMediaShadowIntensity(clip.shadowIntensity),
            shadowMode: normalizeVideoMediaShadowMode(clip.shadowMode),
            transform: resolveMediaClipFitTransform(
              project,
              item,
              clip.fitMode,
              clip.fitScalePercent ?? 100
            ),
          }
        : item
    ),
  });
}
