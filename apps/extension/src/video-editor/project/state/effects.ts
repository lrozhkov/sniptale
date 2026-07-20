import { normalizeVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { isVideoProjectUtilityLaneLocked } from '../../../features/video/project/utility-lanes';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
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
  | 'applyEffectDocument'
  | 'clearCursorSampleSkinOverride'
  | 'deleteActionEvent'
  | 'deleteCursorSample'
  | 'deleteMotionRegion'
  | 'deleteEffectInstance'
  | 'duplicateEffectInstance'
  | 'insertCursorSample'
  | 'moveEffectInstance'
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

function resolveActionKindForPreset(
  preset: NonNullable<VideoEditorProjectState['project']>['actionEvents'][number]['preset']
) {
  switch (preset) {
    case VideoProjectActionPreset.SCROLL_EMPHASIS:
      return VideoProjectActionEventKind.SCROLL;
    case VideoProjectActionPreset.DWELL_ZOOM:
      return VideoProjectActionEventKind.PAUSE;
    case VideoProjectActionPreset.SPOTLIGHT:
      return VideoProjectActionEventKind.CALLOUT;
    case VideoProjectActionPreset.NONE:
    case VideoProjectActionPreset.CLICK_RIPPLE:
      return VideoProjectActionEventKind.CLICK;
  }
}

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
  const updateMotionRegion = createMotionRegionUpdater(set);
  const deleteMotionRegion = createMotionRegionDeleter(set);

  return {
    ...effectInstanceActions,
    clearCursorSampleSkinOverride,
    deleteActionEvent,
    deleteCursorSample,
    deleteMotionRegion,
    insertCursorSample,
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

function createActionDetailsUpdater(set: VideoEditorStoreSet) {
  return (
    actionEventId: string,
    patch: Parameters<VideoEditorProjectState['updateActionEventDetails']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        isVideoProjectUtilityLaneLocked(project, 'actions')
          ? project
          : applyVideoProjectMutationPatch(project, {
              actionEvents: project.actionEvents.map((event) => {
                if (event.id !== actionEventId) {
                  return event;
                }

                const preset = patch.preset ?? event.preset;
                return {
                  ...event,
                  duration: patch.duration ?? event.duration,
                  kind: resolveActionKindForPreset(preset),
                  label: patch.label ?? event.label,
                  point: resolveActionPoint(project, patch.point ?? event.point),
                  preset,
                };
              }),
            })
      )
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
          state.selection.kind === VideoEditorSelectionKind.ACTION_SEGMENT &&
          state.selection.actionEventId === actionEventId
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
              motionRegions: (project.motionRegions ?? []).map((region) =>
                region.id === motionRegionId
                  ? normalizeVideoProjectMotionRegion(project, { ...region, ...patch })
                  : region
              ),
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
          motionRegions: (project.motionRegions ?? []).filter(
            (region) => region.id !== motionRegionId
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
            : state.selection,
      };
    });
}

function resolveActionPoint(
  project: NonNullable<VideoEditorProjectState['project']>,
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
