import { getMotionInsertionRange } from '../../../features/video/project/motion/placement';
import { getVideoProjectUtilityLanes } from '../../../features/video/project/utility-lanes';
import { getVideoProjectActionPresentation } from '../../../features/video/project/action-presentation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { bindMotionRegionToUniqueVideo } from '../../../features/video/project/motion/source-binding';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import { syncProjectSceneBackground } from '../../../features/video/project/scene/background';
import { normalizeVideoProjectCursorSkin } from '../../../features/video/project/cursor';
import {
  VideoCursorCaptureMode,
  type VideoProject,
  VideoProjectInteractionTimeBasis,
  VideoProjectSourceKind,
  type VideoProjectActionPreset,
  type VideoProjectCursorTrack,
  type VideoProjectSceneBackground,
} from '../../../features/video/project/types/index';
import type { VideoTimelinePlacementMode } from '../../../features/video/project/types/index';
import type {
  ClipSelectionPort,
  RecordingTelemetryPort,
  EffectEditingPort,
  ProjectLifecyclePort,
  TimelineEditingPort,
} from '../../contracts/controller-store';

import { resolveActionKindForPreset } from '../../../features/video/project/action-presentation';

type SharedTimelineAction =
  | 'clearCursorSampleSkinOverride'
  | 'deleteMotionRegion'
  | 'updateActionPresentation'
  | 'updateActionEventDetails'
  | 'updateCursorSampleInterpolation'
  | 'updateCursorSampleSkinOverride'
  | 'updateCursorSampleVisibility'
  | 'updateMotionRegion'
  | 'updateProject'
  | 'updateTransitionDuration'
  | 'updateTransitionEasing'
  | 'updateTransitionTemplate'
  | 'upsertObjectTrackCorrectionAnchor';

type WorkspaceProjectUpdaterStore = Pick<ProjectLifecyclePort, 'project'> & {
  getCurrentTime: () => number;
} & Pick<ClipSelectionPort, 'selectMotionRegion'> &
  Pick<RecordingTelemetryPort, 'recordingTelemetry'> &
  Pick<TimelineEditingPort, SharedTimelineAction> &
  EffectEditingPort;

type PreviewProjectUpdaterStore = Pick<ProjectLifecyclePort, 'project'> & {
  getCurrentTime: () => number;
} & Pick<ClipSelectionPort, 'selectMotionRegion'> &
  Pick<
    TimelineEditingPort,
    | 'clearCursorSampleSkinOverride'
    | 'updateActionPresentation'
    | 'updateActionEventDetails'
    | 'updateCursorSampleInterpolation'
    | 'updateCursorSampleSkinOverride'
    | 'updateCursorSampleVisibility'
    | 'updateProject'
  >;

type ProjectMutationStore = Pick<ProjectLifecyclePort, 'project'> & {
  getCurrentTime: () => number;
} & Pick<TimelineEditingPort, 'updateProject'>;
type ActionEventUpdaterStore = ProjectMutationStore &
  Pick<TimelineEditingPort, 'updateActionEventDetails' | 'updateActionPresentation'>;
type CursorUpdaterStore = ProjectMutationStore &
  Pick<
    TimelineEditingPort,
    | 'clearCursorSampleSkinOverride'
    | 'updateCursorSampleInterpolation'
    | 'updateCursorSampleSkinOverride'
    | 'updateCursorSampleVisibility'
  >;

function resolveDefaultActionPoint(store: ProjectMutationStore) {
  const project = store.project;
  if (!project) {
    return null;
  }

  const currentSample = project.cursorTrack?.samples
    .filter((sample) => sample.time <= store.getCurrentTime())
    .sort((left, right) => right.time - left.time)[0];

  if (currentSample) {
    return {
      x: currentSample.x,
      y: currentSample.y,
    };
  }

  return {
    x: project.width / 2,
    y: project.height / 2,
  };
}

type VideoProjectCursorCaptureModeValue = VideoProjectCursorTrack['captureMode'];
type VideoProjectCursorSkinPatch = Partial<NonNullable<VideoProjectCursorTrack['skin']>>;

function createInitialCursorTrack(store: ProjectMutationStore, project: VideoProject) {
  const captureMode =
    project.source.kind === VideoProjectSourceKind.RECORDING
      ? VideoCursorCaptureMode.EMBEDDED_FALLBACK
      : VideoCursorCaptureMode.SEPARATE;
  const cursorTrack = createVideoProjectCursorTrack(captureMode);

  return {
    ...cursorTrack,
    skin: {
      ...cursorTrack.skin,
      hidden: false,
    },
    samples: [
      {
        id: crypto.randomUUID(),
        timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
        time: store.getCurrentTime(),
        visible: true,
        x: project.width / 2,
        y: project.height / 2,
      },
    ],
  };
}

function createActionEventUpdaters(store: ActionEventUpdaterStore) {
  return {
    addActionEvent(preset: VideoProjectActionPreset) {
      store.updateProject((project) =>
        getVideoProjectUtilityLanes(project).actions.locked
          ? project
          : {
              ...project,
              actionEvents: [
                ...project.actionEvents,
                {
                  data: {},
                  id: crypto.randomUUID(),
                  kind: resolveActionKindForPreset(preset),
                  label: '',
                  point: resolveDefaultActionPoint(store),
                  ...(preset === getVideoProjectActionPresentation(project).clickPreset
                    ? {}
                    : { presentation: { preset } }),
                  anchor: { kind: 'project', time: store.getCurrentTime() },
                },
              ],
            }
      );
    },
    deleteActionEvent(actionEventId: string) {
      store.updateProject((project) =>
        getVideoProjectUtilityLanes(project).actions.locked
          ? project
          : {
              ...project,
              actionEvents: project.actionEvents.filter((event) => event.id !== actionEventId),
            }
      );
    },
    updateActionPresentation: store.updateActionPresentation,
    updateActionEventDetails: store.updateActionEventDetails,
  };
}

function createCursorTrackUpdaters(store: CursorUpdaterStore) {
  return {
    enableCursorTrack() {
      store.updateProject((project) => {
        if (project.cursorTrack) {
          return project;
        }

        return {
          ...project,
          cursorTrack: createInitialCursorTrack(store, project),
        };
      });
    },
    setCursorCaptureMode(captureMode: VideoProjectCursorCaptureModeValue) {
      store.updateProject((project) => ({
        ...project,
        cursorTrack: project.cursorTrack
          ? {
              ...project.cursorTrack,
              captureMode,
            }
          : createVideoProjectCursorTrack(captureMode),
      }));
    },
    updateCursorSkin(patch: VideoProjectCursorSkinPatch) {
      store.updateProject((project) => ({
        ...project,
        cursorTrack: project.cursorTrack
          ? {
              ...project.cursorTrack,
              skin: normalizeVideoProjectCursorSkin({
                ...project.cursorTrack.skin,
                ...patch,
              }),
            }
          : project.cursorTrack,
      }));
    },
    clearCursorSampleSkinOverride: store.clearCursorSampleSkinOverride,
    updateCursorSampleVisibility: store.updateCursorSampleVisibility,
    updateCursorSampleInterpolation: store.updateCursorSampleInterpolation,
    updateCursorSampleSkinOverride: store.updateCursorSampleSkinOverride,
  };
}

function createMotionRegionUpdaters(store: WorkspaceProjectUpdaterStore) {
  return {
    addMotionRegion: createMotionRegionAdder(store),
    deleteMotionRegion(motionRegionId: string) {
      store.deleteMotionRegion(motionRegionId);
    },

    updateMotionRegion: store.updateMotionRegion,
  };
}

function createMotionRegionAdder(store: PreviewProjectUpdaterStore) {
  return (startTime?: number) => {
    store.updateProject((project) => {
      if (project.motionRegions?.length && getVideoProjectUtilityLanes(project).camera.locked)
        return project;
      const range = getMotionInsertionRange(project, startTime ?? store.getCurrentTime());
      if (!range) return project;
      const created = createVideoProjectMotionRegion(project, range.startTime);
      const region = bindMotionRegionToUniqueVideo(project, {
        ...created,
        duration: Math.min(created.duration, range.duration),
      });
      queueMicrotask(() => store.selectMotionRegion(region.id));
      return {
        ...project,
        motionRegions: [...(project.motionRegions ?? []), region],
        ...((project.motionRegions?.length ?? 0) === 0
          ? {
              utilityLanes: {
                ...getVideoProjectUtilityLanes(project),
                camera: { visible: true, locked: false },
              },
            }
          : {}),
      };
    });
  };
}

function createProjectPresentationUpdaters(store: WorkspaceProjectUpdaterStore) {
  return {
    resizeProject(width: number, height: number) {
      store.updateProject((project) => ({
        ...project,
        width,
        height,
      }));
    },
    setSceneBackground(sceneBackground: VideoProjectSceneBackground) {
      store.updateProject((project) => ({
        ...project,
        ...syncProjectSceneBackground(project, sceneBackground),
      }));
    },
    setTimelinePlacementMode(timelinePlacementMode: VideoTimelinePlacementMode) {
      store.updateProject((project) => ({
        ...project,
        timelinePlacementMode,
      }));
    },
    updateTransitionDuration: store.updateTransitionDuration,
    updateTransitionEasing: store.updateTransitionEasing,
    updateTransitionTemplate: store.updateTransitionTemplate,
    deleteEffectInstance: store.deleteEffectInstance,
    duplicateEffectInstance: store.duplicateEffectInstance,
    moveEffectInstance: store.moveEffectInstance,
    updateEffectInstance: store.updateEffectInstance,
    upsertObjectTrackCorrectionAnchor: store.upsertObjectTrackCorrectionAnchor,
  };
}

export function createWorkspaceProjectUpdaters(store: WorkspaceProjectUpdaterStore) {
  return {
    ...createActionEventUpdaters(store),
    ...createCursorTrackUpdaters(store),
    ...createMotionRegionUpdaters(store),
    ...createProjectPresentationUpdaters(store),
  };
}

export function createWorkspacePreviewProjectUpdaters(store: PreviewProjectUpdaterStore) {
  return {
    addActionEvent: createActionEventUpdaters(store).addActionEvent,
    addMotionRegion: createMotionRegionAdder(store),
    enableCursorTrack: createCursorTrackUpdaters(store).enableCursorTrack,
  };
}

export type VideoEditorWorkspaceProjectUpdaters = ReturnType<typeof createWorkspaceProjectUpdaters>;
