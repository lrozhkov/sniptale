import { useRecordingEventsProject } from './recording-events';
import { resolveVideoEditorPreviewFrameRate } from '../../../../features/video/preview/preferences';
import { resolveCameraCanvasTransform } from './camera-transform';
import React, { useEffect, useMemo, useRef } from 'react';

import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { usePreviewStageMediaRuntime } from '../media/runtime';
import type { PreviewStageGridSettings } from '../types';
import type { PreviewStageGuide } from '../canvas/snap';
import { resolveVideoEditorPreviewRasterSize } from '../sizing/raster';
import type { PreviewStageProps } from './view-types';
import type { InteractionState } from './interactions';
import { usePreviewEffectRuntimeFeedback } from './feedback';
import { usePreviewStagePresentationTime } from './presentation';
import { usePreviewStageTransientTransform } from './transform-preview';
import { usePreviewSessionExactFrameCache } from './cache-session';
import { useActivePreviewClips } from './index';
import { useCursorTrajectoryProject } from './cursor-trajectory';
import {
  createPreviewStageInteraction,
  getPreviewStageSelection,
  getPreviewStageSizeStyle,
} from './surface-state';

function usePreviewStageInteractionCleanup(
  cleanupRef: React.MutableRefObject<(() => void) | null>,
  interactionRef: React.MutableRefObject<InteractionState | null>
): void {
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      interactionRef.current = null;
    },
    [cleanupRef, interactionRef]
  );
}

function usePresentedStageCamera(project: VideoProject, time: number, playing: boolean) {
  const [presented, setPresented] = React.useState<{
    project: VideoProject;
    camera: VideoCompositionCameraState;
    time: number;
  } | null>(null);
  const onCameraPresented = React.useCallback(
    (camera: VideoCompositionCameraState, completedTime: number) => {
      setPresented({ project, camera, time: completedTime });
    },
    [project]
  );
  const camera: VideoCompositionCameraState =
    presented?.project.id === project.id &&
    presented.project.width === project.width &&
    presented.project.height === project.height
      ? presented.camera
      : {
          viewportX: 0,
          viewportY: 0,
          viewportWidth: project.width,
          viewportHeight: project.height,
          focusPoint: { x: project.width / 2, y: project.height / 2 },
          scale: 1,
          regionId: null,
          motionBlurAmount: 0,
        };
  return {
    camera,
    onCameraPresented,
    current: presented?.project === project && (playing || presented.time === time),
    sameProject: presented?.project.id === project.id,
  };
}

function usePreviewStageSurfaceState(params: {
  currentTime: number;
  isPlaying: boolean;
  interacting: boolean;
  gestureHooks: Parameters<typeof createPreviewStageInteraction>[0]['gestureHooks'];
  grid: PreviewStageGridSettings;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  previewZoom: PreviewStageProps['previewZoom'];
  project: VideoProject;
  selectedClipId: string | null;
  selectedEffectInstanceId?: string | null | undefined;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const interactionCleanupRef = useRef<(() => void) | null>(null);
  const [guides, setGuides] = React.useState<PreviewStageGuide[]>([]);
  const activeClips = useActivePreviewClips(params.project, params.currentTime);
  const selection = getPreviewStageSelection({
    activeClips,
    project: params.project,
    selectedClipId: params.selectedClipId,
    selectedEffectInstanceId: params.selectedEffectInstanceId,
  });
  const { camera, onCameraPresented, current, sameProject } = usePresentedStageCamera(
    params.project,
    params.currentTime,
    params.isPlaying
  );
  usePreviewStageInteractionCleanup(interactionCleanupRef, interactionRef);
  const beginInteraction = createPreviewStageInteraction({
    camera,
    currentTime: params.currentTime,
    ...(params.gestureHooks ? { gestureHooks: params.gestureHooks } : {}),
    interactionCleanupRef,
    interactionRef,
    onGuideChange: setGuides,
    onSelectClip: params.onSelectClip,
    onUpdateClipTransform: (clipId, transform) => {
      const destination = resolveCameraCanvasTransform(
        params.project,
        clipId,
        params.currentTime,
        transform
      );
      if (destination) params.onUpdateClipTransform(clipId, destination);
    },
    project: params.project,
    grid: params.grid,
    stage: stageRef.current,
  });
  return {
    activeClips,
    beginInteraction: (...args: Parameters<typeof beginInteraction>) => {
      if (current) beginInteraction(...args);
    },
    camera,
    cameraInteractionEnabled: current || (sameProject && params.interacting),
    onCameraPresented,
    guides,
    onGuideChange: setGuides,
    selectedClip: selection.selectedClip,
    selectedClipLocked: selection.selectedClipLocked,
    stageRef,
    stageSizeStyle: getPreviewStageSizeStyle(params.project, params.previewZoom),
  };
}

function usePreviewStageTimeline(params: PreviewStageProps) {
  const presentation = usePreviewStagePresentationTime({
    currentTime: params.currentTime,
    isPlaying: params.isPlaying,
    projectId: params.project.id,
    fps: resolveVideoEditorPreviewFrameRate(params.project.fps, params.previewFrameRate),
  });
  const transient = usePreviewStageTransientTransform(params.project, {
    currentTime: presentation.currentTime,
    pause: params.onPausePlayback,
  });
  return { presentation, transient };
}

function usePreviewCompositionProject(project: VideoProject): VideoProject {
  const retained = useRef(project);
  const previous = retained.current;
  // Autosave replaces only updatedAt. Composition consumes the same immutable values.
  if (previous !== project) {
    const keys = Object.keys(project);
    const revisionOnly =
      keys.length === Object.keys(previous).length &&
      keys.every(
        (key) =>
          Object.hasOwn(previous, key) &&
          (key === 'updatedAt' || Object.is(Reflect.get(previous, key), Reflect.get(project, key)))
      );
    if (!revisionOnly) retained.current = project;
  }
  return retained.current;
}

export function usePreviewStageRuntime(params: PreviewStageProps) {
  const project = usePreviewCompositionProject(params.project);
  const { presentation, transient } = usePreviewStageTimeline({ ...params, project });
  const effectRuntimeFeedback = usePreviewEffectRuntimeFeedback();
  const eventsProject = useRecordingEventsProject(
    transient.previewProject,
    transient.currentTime,
    effectRuntimeFeedback
  );
  const cursorProject = useCursorTrajectoryProject(eventsProject, transient.currentTime);
  const previewProject = useMemo(
    () => ({
      ...cursorProject,
      fps: resolveVideoEditorPreviewFrameRate(cursorProject.fps, params.previewFrameRate),
    }),
    [cursorProject, params.previewFrameRate]
  );
  const renderGenerationRef = useRef(0);
  const previewExactFrameCache = usePreviewSessionExactFrameCache();
  const surface = usePreviewStageSurfaceState({
    currentTime: transient.currentTime,
    isPlaying: params.isPlaying,
    interacting: transient.cacheBypass,
    gestureHooks: transient.gestureHooks,
    grid: params.grid,
    onSelectClip: params.onSelectClip,
    onUpdateClipTransform: params.onUpdateClipTransform,
    previewZoom: params.previewZoom,
    project: cursorProject,
    selectedClipId: params.selectedClipId,
    selectedEffectInstanceId: params.selectedEffectInstanceId,
  });
  const previewRasterSize = useMemo(
    () => resolveVideoEditorPreviewRasterSize(previewProject, params.previewRasterPreset),
    [previewProject, params.previewRasterPreset]
  );
  const media = usePreviewStageMediaRuntime({
    activeClips: surface.activeClips,
    assetUrls: params.assetUrls,
    currentTime: transient.currentTime,
    effectRuntimeFeedback,
    isPlaying: params.isPlaying,
    mutePreviewAudio: params.mutePreviewAudio ?? false,
    onPresentationTime: presentation.present,
    playbackRange: params.playbackRange,
    previewExactFrameCache,
    previewMode: params.previewMode,
    previewRenderer: params.previewRenderer ?? 'gpu',
    previewRasterSize,
    project: previewProject,
    recordingProject: transient.previewProject,
    renderGenerationRef,
    registerPreviewRuntime: params.registerPreviewRuntime,
  });
  return {
    cache: { bypass: transient.cacheBypass, exactFrameCache: previewExactFrameCache },
    media,
    previewRasterSize,
    render: {
      onCameraPresented: surface.onCameraPresented,
      registerPlaybackRequest: presentation.registerPlaybackRequest,
      onPreviewEffectAnchors: transient.onPreviewEffectAnchors,
      onPreviewEffectControls: transient.onPreviewEffectControls,
      currentTime: transient.currentTime,
      effectRuntimeFeedback,
      project: previewProject,
      renderGenerationRef,
    },
    surface,
  };
}
