import {
  applyAnnotationTemplatePreset,
  applyAnnotationTemplateStyleSwap,
} from '../../../../features/video/project/annotation/template';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import type {
  VideoProject,
  VideoProjectAnnotationClip,
} from '../../../../features/video/project/types/index';
import {
  type VideoProjectAnnotationStylePatch,
  type VideoProjectAnnotationTemplatePatch,
} from '../../../../features/video/project/annotation/contract';
import { VideoProjectClipType } from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState } from '../contracts';
import { applyProjectUpdate, areClipTracksEditable } from '../helpers';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';

type VideoEditorStoreSet = Parameters<import('zustand').StateCreator<VideoEditorProjectState>>[0];

const ANNOTATION_STYLE_LIMITS: Record<string, { max: number; min: number }> = {
  borderRadius: VIDEO_CLIP_PROPERTY_LIMITS.annotationRadius,
  depthAmount: VIDEO_CLIP_PROPERTY_LIMITS.annotationEffectAmount,
  padding: VIDEO_CLIP_PROPERTY_LIMITS.annotationPadding,
  shimmerAmount: VIDEO_CLIP_PROPERTY_LIMITS.annotationEffectAmount,
};

function normalizeAnnotationStylePatch<TPatch extends VideoProjectAnnotationStylePatch>(
  patch: TPatch
): TPatch {
  const entries: Array<[string, string | number]> = [];
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'number') {
      entries.push([key, value]);
      continue;
    }
    if (!Number.isFinite(value)) {
      continue;
    }

    const limit = ANNOTATION_STYLE_LIMITS[key];
    entries.push([key, limit ? clampVideoPropertyNumber(value, limit) : value]);
  }

  return Object.fromEntries(entries) as TPatch;
}

function updateAnnotationProject(
  project: VideoProject,
  clipId: string,
  updateClip: (clip: VideoProjectAnnotationClip) => VideoProjectAnnotationClip
) {
  if (!areClipTracksEditable(project, [clipId])) {
    return project;
  }

  return applyVideoProjectMutationPatch(project, {
    clips: project.clips.map((clip) =>
      clip.id === clipId && clip.type === VideoProjectClipType.ANNOTATION ? updateClip(clip) : clip
    ),
  });
}

export function createAnnotationClipContentUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateAnnotationClipContent'] {
  return (clipId, patch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        updateAnnotationProject(project, clipId, (clip) => ({
          ...clip,
          content: {
            ...clip.content,
            ...patch,
          },
        }))
      )
    );
}

export function createAnnotationClipStyleUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateAnnotationClipStyle'] {
  return (clipId, patch) =>
    set((state) => {
      const normalizedPatch = normalizeAnnotationStylePatch(patch);
      if (Object.keys(normalizedPatch).length === 0) {
        return {};
      }

      return applyProjectUpdate(state, (project) =>
        updateAnnotationProject(project, clipId, (clip) => ({
          ...clip,
          style: { ...clip.style, ...normalizedPatch },
        }))
      );
    });
}

export function createAnnotationClipTemplateUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateAnnotationClipTemplate'] {
  return (clipId, patch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        updateAnnotationProject(project, clipId, (clip) =>
          applyAnnotationTemplatePatch(project, clip, patch)
        )
      )
    );
}

function applyAnnotationTemplatePatch(
  project: VideoProject,
  clip: VideoProjectAnnotationClip,
  patch: VideoProjectAnnotationTemplatePatch
) {
  const baseClip =
    patch.templateKind === undefined
      ? clip
      : patch.preservePlacementOnTemplateChange
        ? applyAnnotationTemplateStyleSwap(clip, project.width, project.height, patch.templateKind)
        : applyAnnotationTemplatePreset(clip, project.width, project.height, patch.templateKind);

  return {
    ...baseClip,
    ...applyAnnotationContentPatch(baseClip, patch),
    direction: patch.direction ?? baseClip.direction,
    intensity: patch.intensity ?? baseClip.intensity,
    introAnimation: patch.introAnimation ?? baseClip.introAnimation,
    introDurationMs: resolveAnnotationDurationPatch(
      patch.introDurationMs,
      baseClip.introDurationMs
    ),
    leaderLine:
      patch.leaderLine === undefined
        ? baseClip.leaderLine
        : { ...baseClip.leaderLine, ...normalizeLeaderLinePatch(patch.leaderLine) },
    outroAnimation: patch.outroAnimation ?? baseClip.outroAnimation,
    outroDurationMs: resolveAnnotationDurationPatch(
      patch.outroDurationMs,
      baseClip.outroDurationMs
    ),
    style:
      patch.style === undefined
        ? baseClip.style
        : { ...baseClip.style, ...normalizeAnnotationStylePatch(patch.style) },
    target: patch.target ?? baseClip.target,
    targetPoint:
      patch.targetPoint === undefined
        ? baseClip.targetPoint
        : normalizeTargetPoint(patch.targetPoint),
    targetRect:
      patch.targetRect === undefined ? baseClip.targetRect : normalizeTargetRect(patch.targetRect),
    templateControlValues: patch.templateControlValues ?? baseClip.templateControlValues,
    templateRef: patch.templateRef ?? baseClip.templateRef,
    templateKind: patch.templateKind ?? baseClip.templateKind,
    templateSnapshot: patch.templateSnapshot ?? baseClip.templateSnapshot,
  };
}

function applyAnnotationContentPatch(
  baseClip: VideoProjectAnnotationClip,
  patch: VideoProjectAnnotationTemplatePatch
) {
  return {
    calloutDecor:
      patch.calloutDecor === undefined
        ? baseClip.calloutDecor
        : { ...baseClip.calloutDecor, ...patch.calloutDecor },
    content:
      patch.content === undefined ? baseClip.content : { ...baseClip.content, ...patch.content },
  };
}

function resolveAnnotationDurationPatch(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampVideoPropertyNumber(value, VIDEO_CLIP_PROPERTY_LIMITS.annotationDurationMs)
    : fallback;
}

function normalizeLeaderLinePatch(
  patch: NonNullable<VideoProjectAnnotationTemplatePatch['leaderLine']>
): NonNullable<VideoProjectAnnotationTemplatePatch['leaderLine']> {
  return {
    ...patch,
    ...(typeof patch.length === 'number' && Number.isFinite(patch.length)
      ? {
          length: clampVideoPropertyNumber(
            patch.length,
            VIDEO_CLIP_PROPERTY_LIMITS.annotationLeaderLength
          ),
        }
      : {}),
    ...(typeof patch.thickness === 'number' && Number.isFinite(patch.thickness)
      ? {
          thickness: clampVideoPropertyNumber(
            patch.thickness,
            VIDEO_CLIP_PROPERTY_LIMITS.annotationLeaderThickness
          ),
        }
      : {}),
  };
}

function normalizeTargetPoint(
  point: VideoProjectAnnotationClip['targetPoint']
): VideoProjectAnnotationClip['targetPoint'] {
  if (!point) {
    return point;
  }

  return {
    x: clampVideoPropertyNumber(point.x, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetCoordinate),
    y: clampVideoPropertyNumber(point.y, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetCoordinate),
  };
}

function normalizeTargetRect(
  rect: VideoProjectAnnotationClip['targetRect']
): VideoProjectAnnotationClip['targetRect'] {
  if (!rect) {
    return rect;
  }

  return {
    height: clampVideoPropertyNumber(rect.height, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetSize),
    width: clampVideoPropertyNumber(rect.width, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetSize),
    x: clampVideoPropertyNumber(rect.x, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetCoordinate),
    y: clampVideoPropertyNumber(rect.y, VIDEO_CLIP_PROPERTY_LIMITS.annotationTargetCoordinate),
  };
}
