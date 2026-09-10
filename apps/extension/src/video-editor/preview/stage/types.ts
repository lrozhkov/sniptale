import type { VideoProjectEffectInstancePatch } from '../../contracts/commands/patches';
import type { VideoProjectActionOccurrence } from '../../../features/video/project/action-occurrences';
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
import type {
  VideoEditorActionEventPatch,
  VideoEditorMotionRegionPatch,
} from '../../contracts/commands/patches';
import type { VideoEditorObjectTrackActions } from '../../contracts/commands/object-tracks';
import type { PreviewStageGuide } from './canvas/snap';
import type { PreviewStageImportHandlers } from '../../contracts/insertion';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewFrameRate,
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
  onUpdateActionEventDetails: (actionEventId: string, patch: VideoEditorActionEventPatch) => void;
  onUpdateMotionRegion: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
  onUpsertObjectTrackCorrectionAnchor?:
    | VideoEditorObjectTrackActions['upsertObjectTrackCorrectionAnchor']
    | undefined;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => string | null;
  onAddTextOverlay: () => string | null;
  onPreviewEffectAnchors?:
    | ((instanceId: string, anchors: Record<string, { x: number; y: number }> | null) => void)
    | undefined;
  onUpdateEffectInstance?:
    | ((instanceId: string, patch: VideoProjectEffectInstancePatch) => void)
    | undefined;
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
  selectedActionOccurrence: VideoProjectActionOccurrence | null;
  selectedClip: VideoProjectClip | null;
  selectedClipId: string | null;
  selectedClipLocked: boolean;
  selectedMotionRegion: VideoProjectMotionRegion | null;
  stageRef: React.RefObject<HTMLDivElement | null>;
  stageSizeStyle: React.CSSProperties;
  videoBankClips: VideoProjectClip[];
  videoRefs: PreviewStageVideoRefs;
}

/** A workspace-owned alternate viewer kept mounted alongside the montage canvas. */
export interface PreviewStageAlternateView {
  active: boolean;
  content: React.ReactNode;
}

export interface PreviewStageSurfaceProps extends PreviewStageCanvasProps {
  alternateView?: PreviewStageAlternateView | undefined;
  headerContent?: React.ReactNode;
  headerActions?: React.ReactNode;
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
  onPreviewFrameRateChange?: ((frameRate: VideoEditorPreviewFrameRate) => void) | undefined;
  onPreviewRasterPresetChange: (preset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  onSeek: (time: number) => void;
  onSelectScene: () => void;
  onTogglePlay: () => void;
  previewMode: VideoEditorPreviewMode;
  previewPreferencesSaveFailed: boolean;
  previewShowFrameRate?: boolean | undefined;
  onPreviewShowFrameRateChange?: ((value: boolean) => void) | undefined;
  previewFrameRate?: VideoEditorPreviewFrameRate | undefined;
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
  assetUrls: Record<string, string>;
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
