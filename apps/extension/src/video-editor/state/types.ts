import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoEditorExportRuntimeState } from '../contracts/export-state';
import type { VideoEditorExportActions } from '../contracts/commands/export';
import type { VideoEditorProjectActions } from '../contracts/commands/project';
import type { VideoEditorSessionActions } from '../contracts/commands/session';
import type { VideoEditorSaveState } from '../contracts/session-state';
import type { VideoEditorProjectSliceState } from '../project/state/contracts';

interface VideoEditorTimelineState extends VideoEditorProjectSliceState {
  recordingId: string | null;
  isReady: boolean;
  error: string | null;
  saveState: VideoEditorSaveState;
  isPlaying: boolean;
  pixelsPerSecond: number;
  diagnosticsOpen: boolean;
  exportState: VideoEditorExportRuntimeState;
  recordingTelemetry: RecordingTelemetryEntry | null;
  telemetryLaneVisible: boolean;
}

export interface VideoEditorState
  extends
    VideoEditorTimelineState,
    VideoEditorSessionActions,
    VideoEditorProjectActions,
    VideoEditorExportActions {}
