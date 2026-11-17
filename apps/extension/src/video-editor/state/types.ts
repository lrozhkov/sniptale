import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoEditorExportRuntimeState } from '../contracts/export-state';
import type { VideoEditorExportActions } from '../contracts/commands/export';
import type { VideoEditorProjectActions } from '../contracts/commands/project';
import type { VideoEditorSessionActions } from '../contracts/commands/session';
import type { VideoEditorNativeWorkspace, VideoEditorSaveState } from '../contracts/session-state';
import type { VideoEditorProjectSliceState } from '../project/state/contracts';
import type { VideoEditorProjectHistoryActions } from '../contracts/commands/history';

interface VideoEditorTimelineState extends VideoEditorProjectSliceState {
  nativeWorkspace: VideoEditorNativeWorkspace | null;
  projectSessionId: symbol;
  recordingId: string | null;
  isReady: boolean;
  error: string | null;
  autosaveEnabled: boolean;
  saveState: VideoEditorSaveState;
  isPlaying: boolean;
  pixelsPerSecond: number;
  exportState: VideoEditorExportRuntimeState;
  recordingTelemetry: readonly RecordingTelemetryEntry[];
}

export interface VideoEditorState
  extends
    VideoEditorTimelineState,
    VideoEditorSessionActions,
    VideoEditorProjectActions,
    VideoEditorProjectHistoryActions,
    VideoEditorExportActions {}
