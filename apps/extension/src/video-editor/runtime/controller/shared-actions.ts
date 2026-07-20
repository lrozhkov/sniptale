import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import { syncProjectSceneBackground } from '../../../features/video/project/scene/background';
import { isCameraCursorObjectTrack } from '../../../features/video/project/object-tracks';
import { normalizeVideoProjectCursorSkin } from '../../../features/video/project/cursor';
import {
  VideoCursorCaptureMode,
  type VideoProject,
  VideoProjectSourceKind,
  type VideoProjectActionEvent,
  type VideoProjectCursorTrack,
  type VideoProjectSceneBackground,
} from '../../../features/video/project/types/index';
import type { VideoTimelinePlacementMode } from '../../../features/video/project/types/index';
import type { VideoEditorControllerStorePort } from '../../contracts/controller-store';
import {
  canGenerateMotionPathFromCursorTrack,
  createGeneratedMotionPathFromCursorTrack,
} from '../../project/motion-path/cursor-track';
import { createGeneratedMotionPathFromTelemetry } from '../../project/motion-path/telemetry';
import { resolveActionKindForPreset } from '../../../workflows/scenario-video/actions';

function resolveDefaultActionPoint(store: VideoEditorControllerStorePort) {
  const project = store.project;
  if (!project) {
    return null;
  }

  const currentSample = project.cursorTrack?.samples
    .filter((sample) => sample.time <= store.currentTime)
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

function createInitialCursorTrack(store: VideoEditorControllerStorePort, project: VideoProject) {
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
        time: store.currentTime,
        visible: true,
        x: project.width / 2,
        y: project.height / 2,
      },
    ],
  };
}

function createActionEventUpdaters(store: VideoEditorControllerStorePort) {
  return {
    addActionEvent(preset: VideoProjectActionEvent['preset']) {
      store.updateProject((project) => ({
        ...project,
        actionEvents: [
          ...project.actionEvents,
          {
            data: {},
            duration: 0,
            id: crypto.randomUUID(),
            kind: resolveActionKindForPreset(preset),
            label: preset,
            point: resolveDefaultActionPoint(store),
            preset,
            time: store.currentTime,
          },
        ],
      }));
    },
    deleteActionEvent(actionEventId: string) {
      store.updateProject((project) => ({
        ...project,
        actionEvents: project.actionEvents.filter((event) => event.id !== actionEventId),
      }));
    },
    updateActionEventPreset(actionEventId: string, preset: VideoProjectActionEvent['preset']) {
      store.updateProject((project) => ({
        ...project,
        actionEvents: project.actionEvents.map((event) =>
          event.id === actionEventId
            ? {
                ...event,
                kind: resolveActionKindForPreset(preset),
                label: preset,
                preset,
              }
            : event
        ),
      }));
    },
    updateActionEventDetails: store.updateActionEventDetails,
  };
}

function createCursorTrackUpdaters(store: VideoEditorControllerStorePort) {
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

function createMotionRegionUpdaters(store: VideoEditorControllerStorePort) {
  return {
    addMotionRegion(startTime?: number) {
      store.updateProject((project) => {
        const region = createVideoProjectMotionRegion(project, startTime ?? store.currentTime);

        queueMicrotask(() => {
          store.selectMotionRegion(region.id);
        });

        return {
          ...project,
          motionRegions: [...(project.motionRegions ?? []), region],
        };
      });
    },
    deleteMotionRegion(motionRegionId: string) {
      store.deleteMotionRegion(motionRegionId);
    },
    generateMotionPathFromCursor(motionRegionId: string) {
      store.updateProject((project) => ({
        ...project,
        motionRegions: (project.motionRegions ?? []).map((region) =>
          region.id === motionRegionId
            ? {
                ...region,
                cameraMode: 'PATH',
                path: createGeneratedMotionPathForRegion(project, region, store),
              }
            : region
        ),
      }));
    },
    updateMotionRegion: store.updateMotionRegion,
  };
}

function createGeneratedMotionPathForRegion(
  project: VideoProject,
  region: Parameters<typeof createGeneratedMotionPathFromTelemetry>[0]['region'],
  store: VideoEditorControllerStorePort
) {
  const cameraCursorTrack = (project.objectTracks ?? []).find(isCameraCursorObjectTrack) ?? null;
  if (
    canGenerateMotionPathFromCursorTrack({
      project,
      region,
      track: cameraCursorTrack,
    })
  ) {
    return createGeneratedMotionPathFromCursorTrack({
      project,
      region,
      track: cameraCursorTrack,
    });
  }
  return createGeneratedMotionPathFromTelemetry({
    project,
    region,
    telemetry: store.recordingTelemetry,
  });
}

function createProjectPresentationUpdaters(store: VideoEditorControllerStorePort) {
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

export function createWorkspaceProjectUpdaters(store: VideoEditorControllerStorePort) {
  return {
    ...createActionEventUpdaters(store),
    ...createCursorTrackUpdaters(store),
    ...createMotionRegionUpdaters(store),
    ...createProjectPresentationUpdaters(store),
  };
}

export type VideoEditorWorkspaceProjectUpdaters = ReturnType<typeof createWorkspaceProjectUpdaters>;
