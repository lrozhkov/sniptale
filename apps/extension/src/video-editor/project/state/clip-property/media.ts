import { resolveMediaPaddingLayout } from '../../../../features/video/project/factories/framing-presets';
import { parseMediaSourceCrop } from '../../../../features/video/project/media-crop';
import { parseColor } from '@sniptale/foundation/color';
import {
  isBoundedNumber,
  isColorString,
} from '../../../../features/video/project/validation/primitives';
import { parseWindowHeader } from '@sniptale/runtime-contracts/window-header';
import { DEFAULT_CAMERA_APPEARANCE } from '../../../../features/video/project/camera/appearance';
import {
  activeCameraPosition,
  updateCameraPositionVisual,
} from '../../../../features/video/project/camera/animation';
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
  type VideoProjectVideoClip,
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
  | 'updateMediaClipShadowColor'
  | 'editMediaClip'
  | 'updateMediaClipWindowHeader'
  | 'applyMediaClipVisualsToTrack'
> {
  return {
    editMediaClip: (clipId, edit) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const clip = project.clips.find((item) => item.id === clipId);
          if (!isMediaClip(clip) || !areClipTracksEditable(project, [clipId])) return project;
          if (edit.kind === 'padding') return updateMediaPadding(project, clip, edit.padding);
          if (edit.kind === 'window-corner-radius') {
            if (edit.radius !== null && !isBoundedNumber(edit.radius, 0, 4096)) return project;
            const radius = edit.radius === null ? undefined : edit.radius;
            if (radius === clip.windowCornerRadius) return project;
            const { windowCornerRadius: _previous, ...rest } = clip;
            const updated = radius === undefined ? rest : { ...rest, windowCornerRadius: radius };
            return applyVideoProjectMutationPatch(project, {
              clips: project.clips.map((item) => (item.id === clipId ? updated : item)),
            });
          }
          const crop = edit.crop === null ? undefined : parseMediaSourceCrop(edit.crop);
          if (crop === null) return project;
          if (
            (['x', 'y', 'width', 'height'] as const).every(
              (key) => crop?.[key] === clip.sourceCrop?.[key]
            )
          )
            return project;
          const { sourceCrop: previous, rememberedSourceCrop: _remembered, ...rest } = clip;
          const updated =
            crop === undefined
              ? previous
                ? { ...rest, rememberedSourceCrop: previous }
                : rest
              : { ...rest, sourceCrop: crop };
          return applyVideoProjectMutationPatch(project, {
            clips: project.clips.map((item) => (item.id === clipId ? updated : item)),
          });
        })
      ),
    updateMediaClipFitMode: (clipId, fitMode, fitScalePercent) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(
            project,
            clipId,
            { fitMode, ...(fitScalePercent === undefined ? {} : { fitScalePercent }) },
            state.currentTime
          )
        )
      ),
    updateMediaClipFitScalePercent: (clipId, fitScalePercent) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { fitScalePercent }, state.currentTime)
        )
      ),
    updateMediaClipShadowIntensity: (clipId, shadowIntensity) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { shadowIntensity })
        )
      ),
    updateMediaClipShadowColor: (clipId, shadowColor) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { shadowColor })
        )
      ),
    updateMediaClipShadowMode: (clipId, shadowMode) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          updateMediaClipVisuals(project, clipId, { shadowMode })
        )
      ),
    updateMediaClipWindowHeader: (clipId, windowHeader) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const clip = project.clips.find((item) => item.id === clipId);
          if (
            !isMediaClip(clip) ||
            !areClipTracksEditable(project, [clipId]) ||
            project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
          )
            return project;
          const header = windowHeader === undefined ? undefined : parseWindowHeader(windowHeader);
          if (header === null || JSON.stringify(header) === JSON.stringify(clip.windowHeader))
            return project;
          return applyVideoProjectMutationPatch(project, {
            clips: project.clips.map((item) => {
              if (item.id !== clipId || !isMediaClip(item)) return item;
              const { windowHeader: previous, rememberedWindowHeader: _remembered, ...rest } = item;
              return header === undefined
                ? previous
                  ? { ...rest, rememberedWindowHeader: previous }
                  : rest
                : { ...rest, windowHeader: header };
            }),
          });
        })
      ),
    applyMediaClipVisualsToTrack: (clipId) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          applyMediaClipVisualsToTrack(project, clipId, state.currentTime)
        )
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

  const isCamera =
    clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA');
  const transform = resolveMediaClipTransformForFitMode(
    asset.metadata.width * (clip.sourceCrop?.width ?? 1),
    asset.metadata.height * (clip.sourceCrop?.height ?? 1),
    project.width,
    project.height,
    fitMode,
    fitScalePercent,
    isCamera ? undefined : clip.windowHeader,
    { width: asset.metadata.width, height: asset.metadata.height }
  );
  return isCamera ? transform : { ...transform, opacity: clip.transform.opacity };
}

function updateMediaClipVisuals(
  project: VideoProject,
  clipId: string,
  patch: {
    fitMode?: VideoMediaFitMode;
    fitScalePercent?: number;
    shadowIntensity?: number;
    shadowMode?: VideoMediaShadowMode;
    shadowColor?: string;
  },
  time = 0
) {
  const clip = project.clips.find((item) => item.id === clipId);
  if (!isMediaClip(clip) || !areClipTracksEditable(project, [clipId])) {
    return project;
  }

  if (
    patch.shadowColor !== undefined &&
    (!isColorString(patch.shadowColor) || !parseColor(patch.shadowColor))
  )
    return project;
  const shadowColor = patch.shadowColor ?? clip.shadowColor;
  const isCamera =
    clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA');
  const position = isCamera ? activeCameraPosition(clip, time) : undefined;
  const fitMode = patch.fitMode ?? position?.fitMode ?? clip.fitMode;
  const scaleLimits = isCamera
    ? VIDEO_CLIP_PROPERTY_LIMITS.fitScalePercent
    : VIDEO_CLIP_PROPERTY_LIMITS.ordinaryMediaFitScalePercent;
  const fitScalePercent =
    patch.fitScalePercent === undefined
      ? normalizeMediaFitScalePercent(clip.fitScalePercent ?? 100, 100, scaleLimits)
      : normalizeMediaFitScalePercent(
          patch.fitScalePercent,
          clip.fitScalePercent ?? 100,
          scaleLimits
        );
  const shadowIntensity =
    patch.shadowIntensity === undefined
      ? normalizeVideoMediaShadowIntensity(clip.shadowIntensity)
      : normalizeVideoMediaShadowIntensity(patch.shadowIntensity);
  const shadowMode =
    patch.shadowMode === undefined
      ? normalizeVideoMediaShadowMode(clip.shadowMode)
      : normalizeVideoMediaShadowMode(patch.shadowMode);
  const shouldRefreshTransform = patch.fitMode !== undefined || patch.fitScalePercent !== undefined;
  if (
    !shouldRefreshTransform &&
    shadowColor === clip.shadowColor &&
    shadowIntensity === normalizeVideoMediaShadowIntensity(clip.shadowIntensity) &&
    shadowMode === normalizeVideoMediaShadowMode(clip.shadowMode)
  ) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item): VideoProjectClip => {
      if (item.id !== clipId || !isMediaClip(item)) return item;
      if (isCamera && item.type === 'VIDEO' && shouldRefreshTransform) {
        return {
          ...updateCameraPositionVisual(item, time, {
            fitMode,
            transform: resolveMediaClipFitTransform(project, item, fitMode, fitScalePercent),
          }),
          fitScalePercent,
          shadowIntensity,
          shadowMode,
          ...(shadowColor === undefined ? {} : { shadowColor }),
        };
      }
      return {
        ...item,
        fitMode,
        fitScalePercent,
        shadowIntensity,
        shadowMode,
        ...(shadowColor === undefined ? {} : { shadowColor }),
        transform: shouldRefreshTransform
          ? resolveMediaClipFitTransform(project, item, fitMode, fitScalePercent)
          : item.transform,
      };
    }),
  });
}

function normalizeMediaFitScalePercent(
  value: number,
  fallback = 100,
  limits: { min: number; max: number } = VIDEO_CLIP_PROPERTY_LIMITS.fitScalePercent
): number {
  if (!Number.isFinite(value)) {
    return Number.isFinite(fallback) ? clampVideoPropertyNumber(fallback, limits) : 100;
  }

  return clampVideoPropertyNumber(value, limits);
}

function applyMediaClipVisualsToTrack(project: VideoProject, clipId: string, time: number) {
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

  if (
    clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  ) {
    return applyCameraVisualsToTrack(project, clip, time);
  }
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      item.trackId === clip.trackId && isMediaClip(item)
        ? {
            ...copyMediaWindowRadius(copyMediaShadowColor(item, clip), clip),
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

function applyCameraVisualsToTrack(
  project: VideoProject,
  source: VideoProjectVideoClip,
  time: number
) {
  const position = activeCameraPosition(source, time);
  const { width, height } = position?.transform ?? source.transform;
  const fitMode = position?.fitMode ?? source.fitMode;
  const appearance = source.cameraAppearance ?? DEFAULT_CAMERA_APPEARANCE;
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((clip) => {
      if (clip.type !== 'VIDEO' || clip.trackId !== source.trackId) return clip;
      return {
        ...copyMediaShadowColor(clip, source),
        cameraAppearance: { ...appearance },
        shadowIntensity: normalizeVideoMediaShadowIntensity(source.shadowIntensity),
        shadowMode: normalizeVideoMediaShadowMode(source.shadowMode),
        fitMode,
        transform: { ...clip.transform, width, height },
        ...(clip.cameraPositions
          ? {
              cameraPositions: clip.cameraPositions.map((entry) => ({
                ...entry,
                fitMode,
                transform: { ...entry.transform, width, height },
              })),
            }
          : {}),
      };
    }),
  });
}

function copyMediaShadowColor<T extends { shadowColor?: string }>(
  target: T,
  source: { shadowColor?: string }
): T {
  const copy = { ...target };
  if (source.shadowColor === undefined) delete copy.shadowColor;
  else copy.shadowColor = source.shadowColor;
  return copy;
}

function copyMediaWindowRadius<T extends { windowCornerRadius?: number }>(
  target: T,
  source: { windowCornerRadius?: number }
): T {
  const copy = { ...target };
  if (source.windowCornerRadius === undefined) delete copy.windowCornerRadius;
  else copy.windowCornerRadius = source.windowCornerRadius;
  return copy;
}

function updateMediaPadding(project: VideoProject, clip: MediaClip, padding: number) {
  if (
    clip.type === 'VIDEO' &&
    project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
  )
    return project;
  const asset = getAssetById(project, clip.assetId);
  if (!asset) return project;
  const layout = resolveMediaPaddingLayout(
    asset.metadata.width * (clip.sourceCrop?.width ?? 1),
    asset.metadata.height * (clip.sourceCrop?.height ?? 1),
    project.width,
    project.height,
    padding,
    clip.windowHeader,
    { width: asset.metadata.width, height: asset.metadata.height }
  );
  if (!layout) return project;
  const transform = { ...layout.transform, opacity: clip.transform.opacity };
  if (
    clip.fitMode === layout.fitMode &&
    clip.fitScalePercent === layout.fitScalePercent &&
    (['x', 'y', 'width', 'height', 'rotation', 'opacity'] as const).every(
      (key) => clip.transform[key] === transform[key]
    )
  )
    return project;
  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((item) =>
      item.id === clip.id ? { ...clip, ...layout, transform } : item
    ),
  });
}
