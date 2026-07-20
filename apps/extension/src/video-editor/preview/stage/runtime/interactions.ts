import type React from 'react';

import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectTransform,
} from '../../../../features/video/project/types/index';
import {
  getPreviewStageInteractionScale,
  shouldLockPreviewClipToViewport,
} from '../canvas/geometry';
import {
  DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS,
  snapClipTransform,
  type PreviewStageGuide,
  type PreviewStageSnapSettings,
} from '../canvas/snap';
import {
  startPreviewTransformGesture,
  type PreviewTransformGestureHooks,
} from '../canvas/transform/gesture';
import {
  resizePreviewTransform,
  type PreviewTransformResizeHandle,
} from '../canvas/transform/geometry';
import {
  createPreviewTransformGestureState,
  type PreviewTransformClientPoint,
  type PreviewTransformGestureState,
} from '../canvas/transform/state';

type ResizeHandle = 'move' | PreviewTransformResizeHandle;
const PREVIEW_RESIZE_MIN_SIZE = 40;

export interface InteractionState extends PreviewTransformGestureState {
  camera: VideoCompositionCameraState;
  clip: VideoProjectClip;
  mode: ResizeHandle;
  scaleX: number;
  scaleY: number;
}

function createPreviewStageInteractionState(params: {
  clip: VideoProjectClip;
  camera: VideoCompositionCameraState;
  event: React.PointerEvent;
  mode: ResizeHandle;
  project: VideoProject;
  stage: HTMLDivElement;
}): InteractionState {
  const { clip, camera, event, mode, project, stage } = params;
  const interactionScale = getPreviewStageInteractionScale(
    stage,
    project,
    camera,
    shouldLockPreviewClipToViewport(clip, camera)
  );
  const gestureState = createPreviewTransformGestureState({
    clipId: clip.id,
    origin: { clientX: event.clientX, clientY: event.clientY },
    transform: clip.transform,
  });
  return {
    ...gestureState,
    camera,
    clip,
    mode,
    scaleX: interactionScale.scaleX,
    scaleY: interactionScale.scaleY,
  };
}

export function beginPreviewStageInteraction(params: {
  clip: VideoProjectClip;
  camera: VideoCompositionCameraState;
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  event: React.PointerEvent;
  gestureHooks?: PreviewTransformGestureHooks;
  interactionRef: React.MutableRefObject<InteractionState | null>;
  mode: ResizeHandle;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  onGuideChange?: (guides: PreviewStageGuide[]) => void;
  project: VideoProject;
  snapSettings?: PreviewStageSnapSettings;
  stage: HTMLDivElement | null;
  tracks: VideoProject['tracks'];
}): void {
  stopPreviewStagePointerEvent(params.event);
  params.onSelectClip(params.clip.id);
  if (isPreviewStageInteractionBlocked(params.tracks, params.clip.trackId, params.stage)) return;

  const stage = params.stage;
  if (!stage) return;
  params.cleanupRef.current?.();
  const state = createPreviewStageInteractionState({
    clip: params.clip,
    camera: params.camera,
    event: params.event,
    mode: params.mode,
    project: params.project,
    stage,
  });
  params.interactionRef.current = state;
  startPreviewStageTransform(params, state);
}

function startPreviewStageTransform(
  params: Parameters<typeof beginPreviewStageInteraction>[0],
  state: InteractionState
): void {
  const onGuideChange = params.onGuideChange ?? (() => undefined);
  params.cleanupRef.current = startPreviewTransformGesture({
    ...params.gestureHooks,
    onCommit: params.onUpdateClipTransform,
    onFinish: () => {
      if (params.interactionRef.current === state) params.interactionRef.current = null;
      params.cleanupRef.current = null;
      onGuideChange([]);
    },
    resolveTransform: (point) =>
      resolvePreviewStageTransform({
        onGuideChange,
        point,
        project: params.project,
        settings: params.snapSettings ?? DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS,
        state,
      }),
    state,
  });
}

function resolvePreviewStageTransform(params: {
  onGuideChange: (guides: PreviewStageGuide[]) => void;
  point: PreviewTransformClientPoint;
  project: VideoProject;
  settings: PreviewStageSnapSettings;
  state: InteractionState;
}): VideoProjectTransform {
  const delta = {
    x: (params.point.clientX - params.state.origin.clientX) / params.state.scaleX,
    y: (params.point.clientY - params.state.origin.clientY) / params.state.scaleY,
  };
  const transform = resolveUnsnappedTransform(params.state, delta);
  const snapped = snapClipTransform({
    clip: params.state.clip,
    mode: params.state.mode === 'move' ? 'move' : 'resize',
    project: params.project,
    settings: params.settings,
    transform,
  });
  params.onGuideChange(snapped.guides);
  return snapped.transform;
}

function resolveUnsnappedTransform(
  state: InteractionState,
  delta: { x: number; y: number }
): VideoProjectTransform {
  if (state.mode === 'move') {
    return {
      ...state.authoritativeTransform,
      x: state.authoritativeTransform.x + delta.x,
      y: state.authoritativeTransform.y + delta.y,
    };
  }
  return resizePreviewTransform({
    delta,
    handle: state.mode,
    minSize: PREVIEW_RESIZE_MIN_SIZE,
    transform: state.authoritativeTransform,
  });
}

function stopPreviewStagePointerEvent(event: React.PointerEvent): void {
  event.stopPropagation();
  event.preventDefault();
}

function isPreviewStageInteractionBlocked(
  tracks: VideoProject['tracks'],
  trackId: string,
  stage: HTMLDivElement | null
): boolean {
  const clipTrack = tracks.find((track) => track.id === trackId);
  return Boolean(clipTrack?.locked || !stage);
}
