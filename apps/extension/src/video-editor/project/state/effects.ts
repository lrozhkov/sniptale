import { createQuickEditBorder } from '../../../features/video/project/scene/focus-appearance';
import { editMotionBorder } from '../../../features/video/project/motion';
import { patchReviewKeys } from '../../../features/video/project/action-feedback/key-animation';
import {
  getVideoProjectClickStyle,
  getVideoProjectKeyStyle,
  patchVideoProjectActionFeedback,
} from '../../../features/video/project/action-feedback/projection';
import {
  patchReviewClicks,
  REVIEW_CLICK_BOUNDS,
  type ReviewClickStyle,
} from '../../../features/video/review/advanced/click-animation';
import { editMotionSpatialSettings } from '../../../features/video/project/motion/spatial';
import { editMotionTransitionPhase } from '../../../features/video/project/motion/timing';
import { editMotionBlurPhase } from '../../../features/video/project/motion/blur';
import { constrainMotionTiming } from '../../../features/video/project/motion/placement';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import {
  resolveVideoProjectActionPresentations,
  getVideoProjectActionPresentation,
} from '../../../features/video/project/action-presentation';
import {
  isVideoProjectActionPresentation,
  isVideoProjectActionPresentationOverride,
} from '../../../features/video/project/validation/interaction';
import { normalizeVideoProjectMotionRegion } from '../../../features/video/project/motion';
import {
  bindMotionRegionToClip,
  getMotionBindingCandidates,
} from '../../../features/video/project/motion/source-binding';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { isVideoProjectUtilityLaneLocked } from '../../../features/video/project/utility-lanes';
import {
  type VideoProject,
  type VideoProjectActionEvent,
  VideoProjectClipType,
} from '../../../features/video/project/types/index';
import { resolvePlacementModeAfterProjectUpdate } from '../selection/placement';
import { createSceneSelection } from '../selection/model';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type {
  VideoEditorProjectState,
  VideoEditorProjectSliceSet,
  VideoEditorProjectSliceGet,
} from './contracts';
import { applyProjectUpdate } from './helpers';
import {
  createCursorInterpolationUpdater,
  createCursorSampleDeleter,
  createCursorSampleInserter,
  createCursorSkinOverrideClearer,
  createCursorSkinOverrideUpdater,
  createCursorVisibilityUpdater,
} from './effects.cursor';
import {
  createTransitionDurationUpdater,
  createTransitionEasingUpdater,
  createTransitionTemplateUpdater,
} from './effects.transition';
import { createEffectInstanceActions } from './effects.effect-instance';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;
type VideoEditorStoreGet = VideoEditorProjectSliceGet;
type VideoEditorProjectEffectActionSurface = Pick<
  VideoEditorProjectState,
  | 'selectEffectInstance'
  | 'setEffectTargetBypassed'
  | 'setClipEffectsBypassed'
  | 'applyEffectDocument'
  | 'clearCursorSampleSkinOverride'
  | 'deleteActionEvent'
  | 'deleteCursorSample'
  | 'deleteMotionRegion'
  | 'deleteEffectInstance'
  | 'duplicateEffectInstance'
  | 'insertCursorSample'
  | 'moveEffectInstance'
  | 'updateActionPresentation'
  | 'updateActionEventDetails'
  | 'updateCursorSampleInterpolation'
  | 'updateCursorSampleSkinOverride'
  | 'updateCursorSampleVisibility'
  | 'updateMotionRegion'
  | 'updateTransitionDuration'
  | 'updateTransitionEasing'
  | 'updateTransitionTemplate'
  | 'updateEffectInstance'
>;

export function createVideoEditorProjectEffectActions(
  set: VideoEditorStoreSet,
  get: VideoEditorStoreGet
): VideoEditorProjectEffectActionSurface {
  const updateTransitionDuration = createTransitionDurationUpdater(set);
  const updateTransitionEasing = createTransitionEasingUpdater(set);
  const updateTransitionTemplate = createTransitionTemplateUpdater(set);
  const effectInstanceActions = createEffectInstanceActions(set, get);
  const insertCursorSample = createCursorSampleInserter(set);
  const deleteCursorSample = createCursorSampleDeleter(set);
  const clearCursorSampleSkinOverride = createCursorSkinOverrideClearer(set);
  const updateCursorSampleVisibility = createCursorVisibilityUpdater(set);
  const updateCursorSampleInterpolation = createCursorInterpolationUpdater(set);
  const updateCursorSampleSkinOverride = createCursorSkinOverrideUpdater(set);
  const deleteActionEvent = createActionDeleter(set);
  const updateActionEventDetails = createActionDetailsUpdater(set);
  const updateActionPresentation = createActionPresentationUpdater(set);
  const updateMotionRegion = createMotionRegionUpdater(set);
  const deleteMotionRegion = createMotionRegionDeleter(set);

  return {
    ...effectInstanceActions,
    clearCursorSampleSkinOverride,
    deleteActionEvent,
    deleteCursorSample,
    deleteMotionRegion,
    insertCursorSample,
    updateActionPresentation,
    updateActionEventDetails,
    updateCursorSampleInterpolation,
    updateCursorSampleSkinOverride,
    updateCursorSampleVisibility,
    updateMotionRegion,
    updateTransitionDuration,
    updateTransitionEasing,
    updateTransitionTemplate,
  };
}

function createActionPresentationUpdater(set: VideoEditorStoreSet) {
  return (patch: Parameters<VideoEditorProjectState['updateActionPresentation']>[0]) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        if (isVideoProjectUtilityLaneLocked(project, 'actions')) return project;
        const actionPresentation = { ...getVideoProjectActionPresentation(project), ...patch };
        return isVideoProjectActionPresentation(actionPresentation)
          ? applyVideoProjectMutationPatch(project, { actionPresentation })
          : project;
      })
    );
}

function createActionDetailsUpdater(set: VideoEditorStoreSet) {
  return (
    actionEventId: string,
    patch: Parameters<VideoEditorProjectState['updateActionEventDetails']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        if (isVideoProjectUtilityLaneLocked(project, 'actions')) return project;
        const event = project.actionEvents.find((item) => item.id === actionEventId);
        if (
          !event ||
          (patch.presentation === undefined &&
            patch.point === undefined &&
            patch.time === undefined)
        )
          return project;
        if (
          (patch.point !== undefined || patch.presentation?.point !== undefined) &&
          !resolveVideoProjectActionOccurrences(project).some(
            (item) => item.eventId === actionEventId && item.clipId === patch.clipId
          )
        )
          return project;
        const occurrence =
          patch.time === undefined
            ? null
            : resolveVideoProjectActionOccurrences(project).find(
                (item) => item.eventId === actionEventId && item.clipId === patch.clipId
              );
        if (patch.time !== undefined && (!Number.isFinite(patch.time) || !occurrence))
          return project;
        const bounds = event.anchor.kind === 'recording-source' ? { width: 1, height: 1 } : project;
        let presentation =
          patch.presentation === null ? undefined : (patch.presentation ?? event.presentation);
        if (presentation && !isVideoProjectActionPresentationOverride(presentation)) return project;
        let authored = project;
        const style = getVideoProjectClickStyle(project, event);
        const keyStyle = getVideoProjectKeyStyle(project, event);
        if (keyStyle && (patch.point !== undefined || patch.presentation?.point !== undefined))
          return project;
        if (keyStyle && patch.time !== undefined && event.anchor.kind === 'recording-source') {
          const offset = resolveSourceActionOffset(
            project,
            event,
            patch.clipId,
            patch.time,
            keyStyle.offset
          );
          if (offset === null) return project;
          if (offset !== keyStyle.offset) {
            const anchor = event.anchor;
            const group = project.actionFeedback!.find(
              (item) =>
                item.recordingId === anchor.recordingId &&
                item.sourceInstanceId === anchor.sourceInstanceId
            )!;
            authored = patchVideoProjectActionFeedback(project, anchor, {
              keyStyles: patchReviewKeys(group.keyStyles ?? [], [anchor.sourceEventId], { offset }),
            });
          }
        }
        if (style && event.anchor.kind === 'recording-source') {
          const projected = resolveSourceClickEdit(project, event, patch, style);
          if (!projected) return project;
          const { x, y, offset } = projected;
          if (patch.presentation?.point && presentation) {
            const { point: _point, ...remaining } = presentation;
            presentation = {
              ...remaining,
              ...(event.presentation?.point ? { point: event.presentation.point } : {}),
            };
          }
          if (x !== style.x || y !== style.y || offset !== style.offset) {
            const anchor = event.anchor;
            const group = project.actionFeedback!.find(
              (item) =>
                item.recordingId === anchor.recordingId &&
                item.sourceInstanceId === anchor.sourceInstanceId
            )!;
            authored = patchVideoProjectActionFeedback(project, anchor, {
              gestureStyles: patchReviewClicks(group.gestureStyles ?? [], [anchor.sourceEventId], {
                x,
                y,
                offset,
              }),
            });
          }
        }
        if (!style && patch.point !== undefined) {
          const point = resolveActionPoint(bounds, patch.point);
          if (point) presentation = { ...presentation, point };
          else if (patch.point === null && presentation) {
            const { point: _point, ...remaining } = presentation;
            presentation = remaining;
          } else return project;
        }
        if (!style && !keyStyle && patch.time !== undefined && occurrence) {
          const clips = occurrence.playbackRun
            ? project.clips.filter((clip) => occurrence.playbackRun!.clipIds.includes(clip.id))
            : [];
          const start = clips.length ? Math.min(...clips.map((clip) => clip.startTime)) : 0;
          const end = clips.length
            ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
            : project.duration;
          const time = Math.max(
            start,
            Math.min(Math.max(start, end - 1 / project.fps), patch.time)
          );
          presentation = { ...presentation, offset: time - occurrence.time };
        }
        if (presentation?.point)
          presentation = {
            ...presentation,
            point: resolveActionPoint(bounds, presentation.point)!,
          };
        if ((style || keyStyle) && patch.presentation === undefined)
          return authored === project ? project : applyVideoProjectMutationPatch(authored, {});
        const { presentation: _previous, ...captured } = event;
        const updated =
          presentation && Object.keys(presentation).length > 0
            ? { ...captured, presentation }
            : captured;
        return applyVideoProjectMutationPatch(authored, {
          actionEvents: authored.actionEvents.map((item) =>
            item.id === event.id ? updated : item
          ),
        });
      })
    );
}

function resolveSourceClickEdit(
  project: VideoProject,
  event: VideoProjectActionEvent,
  patch: Parameters<VideoEditorProjectState['updateActionEventDetails']>[1],
  style: Readonly<ReviewClickStyle>
): Pick<ReviewClickStyle, 'x' | 'y' | 'offset'> | null {
  let x = style.x,
    y = style.y,
    offset = style.offset;
  const requestedPoint = patch.point !== undefined ? patch.point : patch.presentation?.point;
  if (requestedPoint !== undefined) {
    if (requestedPoint === null) {
      x = 0;
      y = 0;
    } else {
      const point = resolveActionPoint({ width: 1, height: 1 }, requestedPoint);
      if (!point || !event.point) return null;
      x = Math.max(
        REVIEW_CLICK_BOUNDS.x[0],
        Math.min(REVIEW_CLICK_BOUNDS.x[1], point.x - event.point.x)
      );
      y = Math.max(
        REVIEW_CLICK_BOUNDS.y[0],
        Math.min(REVIEW_CLICK_BOUNDS.y[1], point.y - event.point.y)
      );
    }
  }
  if (patch.time !== undefined) {
    const projected = resolveSourceActionOffset(project, event, patch.clipId, patch.time, offset);
    if (projected === null) return null;
    offset = projected;
  }
  return { x, y, offset };
}

/** Source feedback uses bounded result-time deltas from its clipped visual start. */
function resolveSourceActionOffset(
  project: VideoProject,
  event: VideoProjectActionEvent,
  clipId: string | null | undefined,
  time: number,
  offset: number
): number | null {
  const row = resolveVideoProjectActionPresentations(project).find(
    (item) => item.occurrence.eventId === event.id && item.occurrence.clipId === clipId
  );
  if (!row) return null;
  const clips = project.clips.filter((clip) =>
    row.occurrence.playbackRun?.clipIds.includes(clip.id)
  );
  const start = clips.length ? Math.min(...clips.map((clip) => clip.startTime)) : 0;
  const end = clips.length
    ? Math.max(...clips.map((clip) => clip.startTime + clip.duration))
    : project.duration;
  const last = Math.max(start, end - 1 / project.fps);
  const current = Math.max(start, Math.min(last, row.animationStart));
  const requested = Math.max(start, Math.min(last, time));
  return Math.max(-2, Math.min(2, offset + requested - current));
}

function createActionDeleter(set: VideoEditorStoreSet) {
  return (actionEventId: string) =>
    set((state) => {
      if (state.project && isVideoProjectUtilityLaneLocked(state.project, 'actions')) {
        return {};
      }

      const nextState = applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          actionEvents: project.actionEvents.filter((event) => event.id !== actionEventId),
        })
      );

      return {
        ...nextState,
        placementMode: nextState.project
          ? resolvePlacementModeAfterProjectUpdate(nextState.project, state.placementMode)
          : null,
        selection:
          state.selection.kind === VideoEditorSelectionKind.ACTION_OCCURRENCE &&
          state.selection.eventId === actionEventId
            ? createSceneSelection()
            : state.selection,
      };
    });
}

function createMotionRegionUpdater(set: VideoEditorStoreSet) {
  return (
    motionRegionId: string,
    patch: Parameters<VideoEditorProjectState['updateMotionRegion']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        if (isVideoProjectUtilityLaneLocked(project, 'camera')) return project;
        const target = project.motionRegions?.find((region) => region.id === motionRegionId);
        if (patch.borderEdit !== undefined && !target) return project;
        const spatial =
          patch.spatialEdit === undefined
            ? undefined
            : target && editMotionSpatialSettings(target, patch.spatialEdit);
        if (patch.spatialEdit !== undefined && (!target || spatial === null || spatial === target))
          return project;
        const transition =
          patch.motionTransitionPhase === undefined
            ? undefined
            : target && editMotionTransitionPhase(target, patch.motionTransitionPhase);
        if (
          patch.motionTransitionPhase !== undefined &&
          (!target ||
            transition === null ||
            (transition === target && patch.borderEdit === undefined))
        )
          return project;
        const phases =
          patch.motionBlurPhase === undefined
            ? undefined
            : target &&
              editMotionBlurPhase(
                target.motionBlur,
                target.motionBlurAmount ?? 0,
                patch.motionBlurPhase
              );
        if (
          patch.motionBlurPhase !== undefined &&
          (!target || phases === null || phases === target.motionBlur)
        )
          return project;
        let borderRefused = false;
        const motionRegions = (project.motionRegions ?? []).map((region) => {
          if (region.id !== motionRegionId) {
            const groupId = target?.sourceBinding?.animationGroupId;
            return groupId &&
              region.sourceBinding?.animationGroupId === groupId &&
              patch.incomingConnection !== undefined
              ? normalizeVideoProjectMotionRegion(project, {
                  ...region,
                  incomingConnection: patch.incomingConnection,
                })
              : region;
          }
          const {
            sourceClipId,
            borderEdit,
            cameraFollow,
            motionBlurPhase: _phase,
            spatialEdit: _spatial,
            motionTransitionPhase: _transition,
            ...properties
          } = patch;
          if (sourceClipId !== undefined && region.duration <= 0) return region;
          const {
            perspective: _perspective,
            depthOfField: _depth,
            spatialReference: _reference,
            ...withoutSpatial
          } = transition ?? region;
          let updated = {
            ...(spatial ? withoutSpatial : (transition ?? region)),
            ...(spatial?.perspective ? { perspective: spatial.perspective } : {}),
            ...(spatial?.depthOfField ? { depthOfField: spatial.depthOfField } : {}),
            ...(spatial?.spatialReference ? { spatialReference: spatial.spatialReference } : {}),
            ...properties,
            ...(phases ? { motionBlur: phases } : {}),
          };
          if (cameraFollow !== undefined) {
            const { cameraFollow: _previous, ...rest } = updated;
            updated = cameraFollow ? { ...rest, cameraFollow } : rest;
          }
          if (sourceClipId === null) {
            const { sourceBinding: _binding, ...sceneRegion } = updated;
            updated = {
              ...sceneRegion,
              ...(sceneRegion.border ? { borderTarget: 'viewport' as const } : {}),
            };
          } else if (sourceClipId !== undefined && sourceClipId !== region.sourceBinding?.clipId) {
            const bindingRegion =
              borderEdit?.enabled === true
                ? { ...updated, border: updated.border ?? createQuickEditBorder() }
                : updated;
            const source = getMotionBindingCandidates(project, bindingRegion).find(
              (item) => item.id === sourceClipId
            );
            if (!source) return region;
            updated = bindMotionRegionToClip(updated, source);
          }
          const clip = project.clips.find((item) => item.id === updated.sourceBinding?.clipId);
          if (patch.duration !== undefined || patch.startTime !== undefined) {
            updated = {
              ...updated,
              ...constrainMotionTiming(project, region, updated, patch.duration === undefined),
            };
            if (clip?.type === VideoProjectClipType.VIDEO)
              updated = bindMotionRegionToClip(updated, clip);
          }
          if (borderEdit !== undefined) {
            const border = editMotionBorder(project, updated, borderEdit);
            if (!border) {
              borderRefused = true;
              return region;
            }
            const sameBinding =
              sourceClipId === undefined ||
              sourceClipId === region.sourceBinding?.clipId ||
              (sourceClipId === null && !region.sourceBinding);
            if (
              border === updated &&
              sameBinding &&
              Object.keys(patch).every((key) => key === 'borderEdit' || key === 'sourceClipId')
            )
              return region;
            updated = border;
          }
          return normalizeVideoProjectMotionRegion(project, updated);
        });
        if (
          patch.borderEdit !== undefined &&
          (borderRefused ||
            motionRegions.every((region, index) => region === project.motionRegions?.[index]))
        )
          return project;
        return applyVideoProjectMutationPatch(project, { motionRegions });
      })
    );
}

function createMotionRegionDeleter(set: VideoEditorStoreSet) {
  return (motionRegionId: string) =>
    set((state) => {
      if (state.project && isVideoProjectUtilityLaneLocked(state.project, 'camera')) {
        return {};
      }

      const nextState = applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          motionRegions: (project.motionRegions ?? [])
            .filter((region) => region.id !== motionRegionId)
            .map((region) =>
              region.incomingConnection?.fromRegionId === motionRegionId
                ? { ...region, incomingConnection: null }
                : region
            ),
        })
      );

      return {
        ...nextState,
        placementMode: nextState.project
          ? resolvePlacementModeAfterProjectUpdate(nextState.project, state.placementMode)
          : null,
        selection:
          state.selection.kind === VideoEditorSelectionKind.MOTION_REGION &&
          state.selection.motionRegionId === motionRegionId
            ? createSceneSelection()
            : (nextState.selection ?? state.selection),
      };
    });
}

function resolveActionPoint(
  project: Pick<NonNullable<VideoEditorProjectState['project']>, 'width' | 'height'>,
  point: NonNullable<
    NonNullable<VideoEditorProjectState['project']>['actionEvents'][number]['point']
  > | null
) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  return {
    x: Math.min(project.width, Math.max(0, point.x)),
    y: Math.min(project.height, Math.max(0, point.y)),
  };
}
