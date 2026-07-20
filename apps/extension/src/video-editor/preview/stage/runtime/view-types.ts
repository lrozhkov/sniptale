import type { VideoProjectAnnotationTemplatePatch } from '../../../../features/video/project/annotation/contract';
import type {
  VideoProject,
  VideoProjectActionPreset,
  VideoProjectClip,
  VideoProjectMotionRegion,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../../../../features/video/project/types';
import type { VideoEditorObjectTrackActions } from '../../../contracts/commands/object-tracks';
import type { VideoEditorMotionRegionPatch } from '../../../contracts/commands/patches';
import type { PreviewStageImportHandlers } from '../../../contracts/insertion';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { PlaybackPreviewRuntime } from '../../../interaction/playback/types';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from '../../../contracts/preview-runtime';
import type { PreviewStageGridSettings, VideoPreviewCanvasInsertKind } from '../types';

export interface PreviewStageProps {
  project: VideoProject;
  assetUrls: Record<string, string>;
  currentTime: number;
  grid: PreviewStageGridSettings;
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  previewMode: VideoEditorPreviewMode;
  previewPreferencesSaveFailed: boolean;
  previewRasterPreset: VideoEditorPreviewRasterPreset;
  previewZoom: VideoEditorPreviewZoom;
  placementMode: VideoEditorPlacementMode | null;
  selectedClipId: string | null;
  selectedActionEvent: VideoProject['actionEvents'][number] | null;
  selectedMotionRegion: VideoProjectMotionRegion | null;
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: () => void;
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  onClearActiveInsertKind: () => void;
  onClearPlacementMode: () => void;
  onSelectClip: (clipId: string | null) => void;
  onSelectScene: () => void;
  onUpdateAnnotationClipTemplate: (
    clipId: string,
    patch: VideoProjectAnnotationTemplatePatch
  ) => void;
  onUpdateActionEventDetails: (
    actionEventId: string,
    patch: Partial<
      Pick<VideoProject['actionEvents'][number], 'duration' | 'label' | 'point' | 'preset'>
    >
  ) => void;
  onUpdateClipTransform: (clipId: string, patch: Partial<VideoProjectClip['transform']>) => void;
  onUpdateMotionRegion: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
  onUpsertObjectTrackCorrectionAnchor?:
    | VideoEditorObjectTrackActions['upsertObjectTrackCorrectionAnchor']
    | undefined;
  onAddTrack: (kind?: VideoTrackKind) => void;
  onAddSubtitleOverlay?: (() => void) | undefined;
  onAddTextOverlay: () => string | null;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => string | null;
  onEnableCursorTrack: () => void;
  onImport: PreviewStageImportHandlers;
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
  onSeek: (time: number) => void;
  onPausePlayback: () => number;
  onPreviewModeChange: (mode: VideoEditorPreviewMode) => void;
  onPreviewPreferencesRetry: () => void;
  onPreviewRasterPresetChange: (rasterPreset: VideoEditorPreviewRasterPreset) => void;
  onPreviewZoomChange: (zoom: VideoEditorPreviewZoom) => void;
  onTogglePlay: () => void;
}
