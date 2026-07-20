import type { PreviewStageImportHandlers } from '../../../contracts/insertion';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoProjectActionPreset } from '../../../../features/video/project/types';

export interface VideoEditorInsertionActions {
  onAddAnnotationOverlay: VideoEditorProjectActions['addAnnotationOverlay'];
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: (startTime?: number) => void;
  onAddShapeOverlay: VideoEditorProjectActions['addShapeOverlay'];
  onAddSubtitleOverlay?: () => void;
  onAddTextOverlay: () => string | null;
  onAddTrack: VideoEditorProjectActions['addTrack'];
  onEnableCursorTrack: () => void;
  onImport: PreviewStageImportHandlers;
}
