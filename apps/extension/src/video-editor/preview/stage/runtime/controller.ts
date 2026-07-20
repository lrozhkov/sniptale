import React, { useEffect, useRef } from 'react';

import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
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

function usePreviewStageSurfaceState(params: {
  currentTime: number;
  gestureHooks: Parameters<typeof createPreviewStageInteraction>[0]['gestureHooks'];
  grid: PreviewStageGridSettings;
  onSelectClip: (clipId: string | null) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  previewZoom: PreviewStageProps['previewZoom'];
  project: VideoProject;
  selectedClipId: string | null;
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
  });
  const camera = React.useMemo(
    () => resolveVideoCompositionFrame(params.project, params.currentTime).camera,
    [params.currentTime, params.project]
  );
  usePreviewStageInteractionCleanup(interactionCleanupRef, interactionRef);
  return {
    activeClips,
    beginInteraction: createPreviewStageInteraction({
      camera,
      ...(params.gestureHooks ? { gestureHooks: params.gestureHooks } : {}),
      interactionCleanupRef,
      interactionRef,
      onGuideChange: setGuides,
      onSelectClip: params.onSelectClip,
      onUpdateClipTransform: params.onUpdateClipTransform,
      project: params.project,
      grid: params.grid,
      stage: stageRef.current,
    }),
    camera,
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
  });
  const transient = usePreviewStageTransientTransform(params.project, {
    currentTime: presentation.currentTime,
    pause: params.onPausePlayback,
  });
  return { presentation, transient };
}

export function usePreviewStageRuntime(params: PreviewStageProps) {
  const { presentation, transient } = usePreviewStageTimeline(params);
  const renderGenerationRef = useRef(0);
  const effectRuntimeFeedback = usePreviewEffectRuntimeFeedback();
  const previewExactFrameCache = usePreviewSessionExactFrameCache();
  const surface = usePreviewStageSurfaceState({
    currentTime: transient.currentTime,
    gestureHooks: transient.gestureHooks,
    grid: params.grid,
    onSelectClip: params.onSelectClip,
    onUpdateClipTransform: params.onUpdateClipTransform,
    previewZoom: params.previewZoom,
    project: transient.previewProject,
    selectedClipId: params.selectedClipId,
  });
  const previewRasterSize = resolveVideoEditorPreviewRasterSize(
    transient.previewProject,
    params.previewRasterPreset
  );
  const media = usePreviewStageMediaRuntime({
    activeClips: surface.activeClips,
    assetUrls: params.assetUrls,
    currentTime: transient.currentTime,
    effectRuntimeFeedback,
    isPlaying: params.isPlaying,
    onPresentationTime: presentation.present,
    playbackRange: params.playbackRange,
    previewExactFrameCache,
    previewMode: params.previewMode,
    previewRasterSize,
    project: transient.previewProject,
    renderGenerationRef,
    registerPreviewRuntime: params.registerPreviewRuntime,
  });
  return {
    cache: { bypass: transient.cacheBypass, exactFrameCache: previewExactFrameCache },
    media,
    previewRasterSize,
    render: {
      currentTime: transient.currentTime,
      effectRuntimeFeedback,
      project: transient.previewProject,
      renderGenerationRef,
    },
    surface,
  };
}
