import type React from 'react';

import type { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import type { VideoEditorPreviewZoom } from '../../../contracts/preview-runtime';
import type { PreviewTransformGestureHooks } from '../canvas/transform/gesture';
import type { PreviewStageGuide } from '../canvas/snap';
import type {
  PreviewStageGridSettings,
  PreviewStageInteractionHandler,
  PreviewStageInteractionMode,
} from '../types';
import { resolvePreviewStageSizeStyle } from '../sizing/zoom';
import { beginPreviewStageInteraction, type InteractionState } from './interactions';

export function getPreviewStageSelection(params: {
  activeClips: VideoProjectClip[];
  project: VideoProject;
  selectedClipId: string | null;
}) {
  const selectedClip = params.activeClips.find((clip) => clip.id === params.selectedClipId) ?? null;
  const selectedClipTrack = selectedClip
    ? (params.project.tracks.find((track) => track.id === selectedClip.trackId) ?? null)
    : null;
  return { selectedClip, selectedClipLocked: Boolean(selectedClipTrack?.locked) };
}

export function getPreviewStageSizeStyle(
  project: VideoProject,
  zoom: VideoEditorPreviewZoom = 'fit'
): React.CSSProperties {
  return resolvePreviewStageSizeStyle(project, zoom);
}

export function createPreviewStageInteraction(params: {
  camera: ReturnType<typeof resolveVideoCompositionFrame>['camera'];
  gestureHooks?: PreviewTransformGestureHooks;
  grid?: PreviewStageGridSettings;
  interactionCleanupRef: React.MutableRefObject<(() => void) | null>;
  interactionRef: React.MutableRefObject<InteractionState | null>;
  onGuideChange?: (guides: PreviewStageGuide[]) => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  project: VideoProject;
  stage: HTMLDivElement | null;
}): PreviewStageInteractionHandler {
  return (event: React.PointerEvent, clip: VideoProjectClip, mode: PreviewStageInteractionMode) =>
    beginPreviewStageInteraction({
      clip,
      camera: params.camera,
      cleanupRef: params.interactionCleanupRef,
      event,
      ...(params.gestureHooks ? { gestureHooks: params.gestureHooks } : {}),
      interactionRef: params.interactionRef,
      mode,
      onGuideChange: params.onGuideChange ?? (() => undefined),
      onSelectClip: params.onSelectClip,
      onUpdateClipTransform: params.onUpdateClipTransform,
      project: params.project,
      snapSettings: {
        gridEnabled: params.grid?.enabled ?? false,
        gridSize: params.grid?.size ?? 80,
        gridSnapEnabled: params.grid?.snapEnabled ?? false,
        magnetEnabled: params.grid?.magnetEnabled ?? false,
      },
      stage: params.stage,
      tracks: params.project.tracks,
    });
}
