import type {
  VideoProjectExportSettings,
  VideoProjectExportStatus,
} from '../../features/video/project/types/index';

export interface VideoEditorExportResult {
  filename: string;
  recordingId: string;
  exportId: string;
}

export interface VideoEditorExportRuntimeState {
  dialogOpen: boolean;
  isRunning: boolean;
  jobId: string | null;
  status: VideoProjectExportStatus | null;
  settings: VideoProjectExportSettings | null;
  error: string | null;
  lastResult: VideoEditorExportResult | null;
}
