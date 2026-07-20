import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../features/video/project/types/index';
import type { VideoEditorExportActions } from './commands/export';
import type { VideoEditorProjectActions } from './commands/project';
import type { VideoEditorSessionActions } from './commands/session';
import type { VideoEditorExportRuntimeState } from './export-state';
import type { VideoEditorSaveState } from './session-state';
import type { VideoEditorPlacementMode } from './placement';
import type { VideoEditorSelection } from './selection';

/** Explicit port selected by the Zustand composition adapter for runtime controllers. */
export interface VideoEditorControllerStorePort
  extends VideoEditorProjectActions, VideoEditorSessionActions, VideoEditorExportActions {
  currentTime: number;
  diagnosticsOpen: boolean;
  error: string | null;
  exportState: VideoEditorExportRuntimeState;
  isPlaying: boolean;
  isReady: boolean;
  pixelsPerSecond: number;
  placementMode: VideoEditorPlacementMode | null;
  project: VideoProject | null;
  recordingId: string | null;
  recordingTelemetry: RecordingTelemetryEntry | null;
  saveState: VideoEditorSaveState;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selection: VideoEditorSelection;
  telemetryLaneVisible: boolean;
}
