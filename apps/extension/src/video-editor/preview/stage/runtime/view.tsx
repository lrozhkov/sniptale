import React from 'react';

import { PreviewStageSurface } from '../canvas/surface';
import type { PreviewStageSurfaceProps } from '../types';
import { usePreviewStageRuntime } from './controller';
import type { PreviewStageProps } from './view-types';

export type { PreviewStageProps } from './view-types';

interface PreviewStageViewProps {
  runtime: ReturnType<typeof usePreviewStageRuntime>;
  source: PreviewStageProps;
}

function PreviewStageView({ runtime, source }: PreviewStageViewProps) {
  return <PreviewStageSurface {...buildPreviewStageSurfaceProps(source, runtime)} />;
}

function buildPreviewStageSurfaceProps(
  props: PreviewStageProps,
  runtime: ReturnType<typeof usePreviewStageRuntime>
): PreviewStageSurfaceProps {
  return {
    activeClips: runtime.surface.activeClips,
    activeInsertKind: props.activeInsertKind,
    audioBankClips: runtime.media.audioBankClips,
    audioRefs: runtime.media.audioRefs,
    assetUrls: props.assetUrls,
    beginInteraction: runtime.surface.beginInteraction,
    camera: runtime.surface.camera,
    cachedVideo: runtime.media.cachedVideo,
    currentTime: runtime.render.currentTime,
    effectRuntimeFeedback: runtime.render.effectRuntimeFeedback,
    grid: props.grid,
    guides: runtime.surface.guides,
    isPlaying: props.isPlaying,
    mode: 'editor',
    playbackRange: props.playbackRange,
    placementMode: props.placementMode,
    previewMode: props.previewMode,
    previewPreferencesSaveFailed: props.previewPreferencesSaveFailed,
    previewCacheBypass: runtime.cache.bypass,
    previewExactFrameCache: runtime.cache.exactFrameCache,
    previewRasterPreset: props.previewRasterPreset,
    previewRasterSize: runtime.previewRasterSize,
    previewZoom: props.previewZoom,
    previewStatus: runtime.media.previewStatus,
    project: runtime.render.project,
    renderGenerationRef: runtime.render.renderGenerationRef,
    selectedActionEvent: props.selectedActionEvent,
    selectedClip: runtime.surface.selectedClip,
    selectedClipId: props.selectedClipId,
    selectedClipLocked: runtime.surface.selectedClipLocked,
    selectedMotionRegion: props.selectedMotionRegion,
    stageRef: runtime.surface.stageRef,
    stageSizeStyle: runtime.surface.stageSizeStyle,
    videoBankClips: runtime.media.videoBankClips,
    videoRefs: runtime.media.videoRefs,
    ...buildPreviewStageSurfaceActionProps(props, runtime),
  };
}

function buildPreviewStageSurfaceActionProps(
  props: PreviewStageProps,
  runtime: ReturnType<typeof usePreviewStageRuntime>
) {
  return {
    onAddActionEvent: props.onAddActionEvent,
    onAddMotionRegion: props.onAddMotionRegion,
    onAddShapeOverlay: props.onAddShapeOverlay,
    onAddSubtitleOverlay: props.onAddSubtitleOverlay,
    onAddTextOverlay: props.onAddTextOverlay,
    onAddTrack: props.onAddTrack,
    onClearActiveInsertKind: props.onClearActiveInsertKind,
    onClearPlacementMode: props.onClearPlacementMode,
    onEnableCursorTrack: props.onEnableCursorTrack,
    onGuideChange: runtime.surface.onGuideChange,
    onImport: props.onImport,
    onPreviewModeChange: props.onPreviewModeChange,
    onPreviewPreferencesRetry: props.onPreviewPreferencesRetry,
    onPreviewRasterPresetChange: props.onPreviewRasterPresetChange,
    onPreviewZoomChange: props.onPreviewZoomChange,
    onSeek: props.onSeek,
    onSelectClip: props.onSelectClip,
    onSelectScene: props.onSelectScene,
    onTogglePlay: props.onTogglePlay,
    onUpdateActionEventDetails: props.onUpdateActionEventDetails,
    onUpdateAnnotationClipTemplate: props.onUpdateAnnotationClipTemplate,
    onUpdateClipTransform: props.onUpdateClipTransform,
    onUpdateMotionRegion: props.onUpdateMotionRegion,
    onUpsertObjectTrackCorrectionAnchor: props.onUpsertObjectTrackCorrectionAnchor,
  };
}

export const PreviewStage: React.FC<PreviewStageProps> = (props) => {
  const runtime = usePreviewStageRuntime(props);
  return <PreviewStageView runtime={runtime} source={props} />;
};
