import { constrainMotionTiming } from '../../../features/video/project/motion/placement';
import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import { getVideoProjectActionPresentation } from '../../../features/video/project/action-presentation';
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
import { VideoProjectClipType } from '../../../features/video/project/types/index';
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
        if (patch.point !== undefined) {
          const point = resolveActionPoint(bounds, patch.point);
          if (point) presentation = { ...presentation, point };
          else if (patch.point === null && presentation) {
            const { point: _point, ...remaining } = presentation;
            presentation = remaining;
          } else return project;
        }
        if (patch.time !== undefined && occurrence) {
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
        const { presentation: _previous, ...captured } = event;
        const updated =
          presentation && Object.keys(presentation).length > 0
            ? { ...captured, presentation }
            : captured;
        return applyVideoProjectMutationPatch(project, {
          actionEvents: project.actionEvents.map((item) => (item.id === event.id ? updated : item)),
        });
      })
    );
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
      applyProjectUpdate(state, (project) =>
        isVideoProjectUtilityLaneLocked(project, 'camera')
          ? project
          : applyVideoProjectMutationPatch(project, {
              motionRegions: (project.motionRegions ?? []).map((region) => {
                if (region.id !== motionRegionId) {
                  const groupId = project.motionRegions?.find((item) => item.id === motionRegionId)
                    ?.sourceBinding?.animationGroupId;
                  return groupId &&
                    region.sourceBinding?.animationGroupId === groupId &&
                    patch.incomingConnection !== undefined
                    ? normalizeVideoProjectMotionRegion(project, {
                        ...region,
                        incomingConnection: patch.incomingConnection,
                      })
                    : region;
                }
                const { sourceClipId, ...properties } = patch;
                if (sourceClipId !== undefined && region.duration <= 0) return region;
                let updated = { ...region, ...properties };
                if (sourceClipId === null) {
                  const { sourceBinding: _binding, ...sceneRegion } = updated;
                  updated = sceneRegion;
                } else if (sourceClipId !== undefined) {
                  const source = getMotionBindingCandidates(project, updated).find(
                    (item) => item.id === sourceClipId
                  );
                  if (!source) return region;
                  updated = bindMotionRegionToClip(updated, source);
                }
                const clip = project.clips.find(
                  (item) => item.id === updated.sourceBinding?.clipId
                );
                if (patch.duration !== undefined || patch.startTime !== undefined) {
                  updated = {
                    ...updated,
                    ...constrainMotionTiming(
                      project,
                      region,
                      updated,
                      patch.duration === undefined
                    ),
                  };
                  if (clip?.type === VideoProjectClipType.VIDEO)
                    updated = bindMotionRegionToClip(updated, clip);
                }
                return normalizeVideoProjectMotionRegion(project, updated);
              }),
            })
      )
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
