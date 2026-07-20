import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import {
  VideoProjectClipType,
  type VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import {
  createAnnotationClipContentUpdater,
  createAnnotationClipStyleUpdater,
  createAnnotationClipTemplateUpdater,
} from './annotation';
import { applyProjectUpdate, areClipTracksEditable } from '../helpers';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

type NumericStyleLimitMap = Record<string, { max: number; min: number }>;

const TEXT_STYLE_LIMITS: NumericStyleLimitMap = {
  borderWidth: VIDEO_CLIP_PROPERTY_LIMITS.textBorderWidth,
  fontSize: VIDEO_CLIP_PROPERTY_LIMITS.textFontSize,
  fontWeight: VIDEO_CLIP_PROPERTY_LIMITS.textFontWeight,
  lineHeight: VIDEO_CLIP_PROPERTY_LIMITS.textLineHeight,
  padding: VIDEO_CLIP_PROPERTY_LIMITS.textPadding,
};

const SHAPE_STYLE_LIMITS: NumericStyleLimitMap = {
  borderRadius: VIDEO_CLIP_PROPERTY_LIMITS.shapeRadius,
  strokeWidth: VIDEO_CLIP_PROPERTY_LIMITS.shapeStrokeWidth,
};

function normalizeNumericStylePatch<TPatch extends Record<string, string | number>>(
  patch: TPatch,
  limits: NumericStyleLimitMap
): TPatch {
  const normalizedEntries: Array<[string, string | number]> = Object.entries(patch).flatMap(
    ([key, value]) => {
      if (typeof value !== 'number') {
        return [[key, value] as [string, string | number]];
      }
      if (!Number.isFinite(value)) {
        return [];
      }

      const limit = limits[key];
      const normalizedValue = limit ? clampVideoPropertyNumber(value, limit) : value;
      return [[key, normalizedValue] as [string, string | number]];
    }
  );

  return Object.fromEntries(normalizedEntries) as TPatch;
}

export function createClipTextStyleActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  | 'updateTextClipContent'
  | 'updateTextClipStyle'
  | 'updateShapeClipStyle'
  | 'updateAnnotationClipContent'
  | 'updateAnnotationClipStyle'
  | 'updateAnnotationClipTemplate'
> {
  return {
    updateAnnotationClipContent: createAnnotationClipContentUpdater(set),
    updateAnnotationClipStyle: createAnnotationClipStyleUpdater(set),
    updateAnnotationClipTemplate: createAnnotationClipTemplateUpdater(set),
    updateTextClipContent: createTextClipContentUpdater(set),
    updateTextClipStyle: createTextClipStyleUpdater(set),
    updateShapeClipStyle: createShapeClipStyleUpdater(set),
  };
}

function createTextClipContentUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateTextClipContent'] {
  return (clipId, text) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        if (!areClipTracksEditable(project, [clipId])) {
          return project;
        }

        return applyVideoProjectMutationPatch(project, {
          clips: project.clips.map((clip) =>
            clip.id === clipId &&
            (clip.type === VideoProjectClipType.TEXT || clip.type === VideoProjectClipType.SUBTITLE)
              ? { ...clip, text }
              : clip
          ),
        });
      })
    );
}

function createTextClipStyleUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateTextClipStyle'] {
  return createClipStyleUpdater(set, TEXT_STYLE_LIMITS, (clip, clipId, normalizedPatch) =>
    clip.id === clipId && clip.type === VideoProjectClipType.TEXT
      ? { ...clip, style: { ...clip.style, ...normalizedPatch } }
      : clip
  );
}

function createShapeClipStyleUpdater(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateShapeClipStyle'] {
  return createClipStyleUpdater(set, SHAPE_STYLE_LIMITS, (clip, clipId, normalizedPatch) =>
    clip.id === clipId && clip.type === VideoProjectClipType.SHAPE
      ? { ...clip, style: { ...clip.style, ...normalizedPatch } }
      : clip
  );
}

function createClipStyleUpdater(
  set: VideoEditorStoreSet,
  limits: NumericStyleLimitMap,
  applyStylePatch: (
    clip: VideoProjectClip,
    clipId: string,
    normalizedPatch: Record<string, string | number>
  ) => VideoProjectClip
):
  | VideoEditorProjectState['updateTextClipStyle']
  | VideoEditorProjectState['updateShapeClipStyle'] {
  return (clipId, patch) =>
    set((state) => {
      const normalizedPatch = normalizeNumericStylePatch(patch, limits);
      if (Object.keys(normalizedPatch).length === 0) {
        return {};
      }

      return applyProjectUpdate(state, (project) => {
        if (!areClipTracksEditable(project, [clipId])) {
          return project;
        }

        return applyVideoProjectMutationPatch(project, {
          clips: project.clips.map((clip) => applyStylePatch(clip, clipId, normalizedPatch)),
        });
      });
    });
}
