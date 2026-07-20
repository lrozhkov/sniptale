import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorSelections } from '../selections';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorInsertionActions } from './insertion';
import type {
  VideoEditorPreviewMode,
  VideoEditorPreviewRasterPreset,
  VideoEditorPreviewZoom,
} from '../../../../features/video/preview/preferences';

interface VideoEditorPreviewGridController {
  color: string;
  enabled: boolean;
  magnetEnabled: boolean;
  size: number;
  snapEnabled: boolean;
}

export interface VideoEditorPreviewController {
  assetUrls: VideoEditorRuntimeController['assetUrls'];
  editing: Omit<VideoEditorInsertionActions, 'onImport'> & {
    onUpdateAnnotationClipTemplate: VideoEditorProjectActions['updateAnnotationClipTemplate'];
    onUpdateClipTransform: VideoEditorProjectActions['updateClipTransform'];
  };
  grid: VideoEditorPreviewGridController;
  onImport: VideoEditorInsertionActions['onImport'];
  pointAuthoring: {
    onClearPlacementMode: VideoEditorSessionActions['clearPlacementMode'];
    onUpdateActionEventDetails: VideoEditorProjectActions['updateActionEventDetails'];
    onUpdateMotionRegion: VideoEditorProjectActions['updateMotionRegion'];
    onUpsertObjectTrackCorrectionAnchor: VideoEditorProjectActions['upsertObjectTrackCorrectionAnchor'];
  };
  preferences: {
    mode: VideoEditorPreviewMode;
    onModeChange: (mode: VideoEditorPreviewMode) => void;
    onRasterPresetChange: (rasterPreset: VideoEditorPreviewRasterPreset) => void;
    onRetrySave: () => void;
    onZoomChange: (zoom: VideoEditorPreviewZoom) => void;
    rasterPreset: VideoEditorPreviewRasterPreset;
    saveFailed: boolean;
    zoom: VideoEditorPreviewZoom;
  };
  project: VideoProject;
  selection: {
    placementMode: VideoEditorPlacementMode | null;
    selectedActionEvent: VideoEditorSelections['selectedActionEvent'];
    selectedClipId: string | null;
    selectedMotionRegion: VideoEditorSelections['selectedMotionRegion'];
    onSelectClip: VideoEditorSessionActions['selectClip'];
    onSelectScene: VideoEditorSessionActions['selectScene'];
  };
  transport: {
    currentTime: number;
    isPlaying: boolean;
    onPausePlayback: () => number;
    playbackRange: VideoEditorPlaybackRange | null;
    onSeek: VideoEditorRuntimeController['seekTo'];
    onTogglePlay: VideoEditorRuntimeController['togglePlayback'];
    registerPreviewRuntime: VideoEditorRuntimeController['registerPreviewRuntime'];
  };
}
