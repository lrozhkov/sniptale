import type React from 'react';

import type { VideoCompositionCameraState } from '../../../features/video/composition/types';
import type { VideoEditorPlacementMode } from '../../contracts/placement';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import type {
  VideoProject,
  VideoProjectActionPreset,
  VideoProjectAudioClip,
  VideoProjectClip,
  VideoProjectMotionRegion,
  VideoProjectShapeType,
  VideoProjectVideoClip,
  VideoTrackKind,
} from '../../../features/video/project/types/index';
import type { VideoProjectAnnotationTemplatePatch } from '../../../features/video/project/annotation/contract';
import type { VideoEditorMotionRegionPatch } from '../../contracts/commands/patches';
import type { VideoEditorObjectTrackActions } from '../../contracts/commands/object-tracks';
import type { PreviewStageGuide } from './canvas/snap';
import type { PreviewStageImportHandlers } from '../../contracts/insertion';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from '../../contracts/preview-runtime';
import type { VideoEditorPreviewRasterSize } from './sizing/raster';
import type { VideoPreviewExactFrameCache } from '../cache/exact-frame-cache';
import type { PreparedCachedVideoPreview } from '../cache/types';
import type { VideoEditorPreviewStatus } from '../../contracts/preview-runtime';
export type PreviewStageInteractionMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
export type VideoPreviewCanvasInsertKind = 'arrow' | 'line' | 'shape' | 'text';
export type PreviewStageAudioBankClip = VideoProjectAudioClip | VideoProjectVideoClip;
export type PreviewSceneBounds = { height: number; width: number };
export interface PreviewStageGridSettings {
  color: string;
  enabled: boolean;
  magnetEnabled: boolean;
  size: number;
  snapEnabled: boolean;
}
export type PreviewSceneViewport = PreviewSceneBounds & {
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type PreviewStageInteractionHandler = (
  event: React.PointerEvent,
  clip: VideoProjectClip,
  mode: PreviewStageInteractionMode
) => void;

export type PreviewStageVideoRefs = React.MutableRefObject<Record<string, HTMLVideoElement | null>>;
export type PreviewStageAudioRefs = React.MutableRefObject<Record<string, HTMLAudioElement | null>>;

export type PreviewEffectRuntimeSource = 'audio' | 'visual';

export interface PreviewEffectRuntimeFeedback {
  failed: boolean;
  onFailure: (source: PreviewEffectRuntimeSource, error: unknown) => void;
  onRecovery: (source: PreviewEffectRuntimeSource) => void;
  onRetry: () => void;
  retryVersion: number;
}

export interface PreviewStageCanvasProps {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  activeClips: VideoProjectClip[];
  audioBankClips: PreviewStageAudioBankClip[];
  audioRefs: PreviewStageAudioRefs;
  assetUrls: Record<string, string>;
  beginInteraction: PreviewStageInteractionHandler;
  camera: VideoCompositionCameraState;
  cachedVideo: PreparedCachedVideoPreview | null;
  currentTime: number;
  effectRuntimeFeedback: PreviewEffectRuntimeFeedback;
  guides?: PreviewStageGuide[];
  grid?: PreviewStageGridSettings;
  isPlaying: boolean;
  mode: 'editor' | 'player';
  onGuideChange?: (guides: PreviewStageGuide[]) => void;
  onClearActiveInsertKind: () => void;
  onClearPlacementMode: () => void;
  onSelectClip: (clipId: string | null) => void;
  onUpdateActionEventDetails: (
    actionEventId: string,
    patch: Partial<
      Pick<VideoProject['actionEvents'][number], 'duration' | 'label' | 'point' | 'preset'>
    >
  ) => void;
  onUpdateMotionRegion: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
  onUpsertObjectTrackCorrectionAnchor?:
    | VideoEditorObjectTrackActions['upsertObjectTrackCorrectionAnchor']
    | undefined;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => string | null;
  onAddTextOverlay: () => string | null;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  onUpdateAnnotationClipTemplate: (
    clipId: string,
    patch: VideoProjectAnnotationTemplatePatch
  ) => void;
  placementMode: VideoEditorPlacementMode | null;
  previewRasterSize: VideoEditorPreviewRasterSize;
  previewMode: VideoEditorPreviewMode;
  previewCacheBypass: boolean;
  previewExactFrameCache: VideoPreviewExactFrameCache;
  renderGenerationRef?: React.MutableRefObject<number>;
  project: VideoProject;
  selectedActionEvent: VideoProject['actionEvents'][number] | null;
  selectedClip: VideoProjectClip | null;
  selectedClipId: string | null;
  selectedClipLocked: boolean;
  selectedMotionRegion: VideoProjectMotionRegion | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  stageSizeStyle: React.CSSProperties;
  videoBankClips: VideoProjectClip[];
  videoRefs: PreviewStageVideoRefs;
}

export interface PreviewStageSurfaceProps extends PreviewStageCanvasProps {
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: () => void;
  onAddTrack: (kind?: VideoTrackKind) => void;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => string | null;
  onAddSubtitleOverlay?: (() => void) | undefined;
  onAddTextOverlay: () => string | null;
  onEnableCursorTrack: () => void;
  onImport: PreviewStageImportHandlers;
  onPreviewModeChange: (mode: VideoEditorPreviewMode) => void;
  onPreviewPreferencesRetry: () => void;
  onPreviewRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  onSeek: (time: number) => void;
  onSelectScene: () => void;
  onTogglePlay: () => void;
  previewMode: VideoEditorPreviewMode;
  previewPreferencesSaveFailed: boolean;
  previewRasterPreset: VideoEditorPreviewRasterPreset;
  previewZoom: VideoEditorPreviewZoom;
  previewStatus: VideoEditorPreviewStatus;
}

export interface PreviewStageAnnotationTargetOverlayProps {
  camera: VideoCompositionCameraState;
  onUpdateAnnotationClipTemplate: (
    clipId: string,
    patch: VideoProjectAnnotationTemplatePatch
  ) => void;
  project: VideoProject;
  selectedClip: VideoProjectClip | null;
  selectedClipLocked: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
}

export interface PreviewStageVideoSyncParams {
  activeClips: VideoProjectClip[];
  currentTime: number;
  isPlaying: boolean;
  syncedClips: VideoProjectClip[];
  videoRefs: PreviewStageVideoRefs;
}

export interface PreviewStageAudioSyncParams {
  audioRefs: PreviewStageAudioRefs;
  currentTime: number;
  isPlaying: boolean;
  project: VideoProject;
  syncedClips: VideoProjectClip[];
}
