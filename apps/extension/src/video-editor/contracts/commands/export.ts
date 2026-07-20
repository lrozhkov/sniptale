import type {
  VideoProjectExportSettings,
  VideoProjectExportStatus,
} from '../../../features/video/project/types/index';
import type { VideoEditorExportResult } from '../export-state';

export interface VideoEditorExportActions {
  openExportDialog: () => void;
  closeExportDialog: () => void;
  updateExportSettings: (patch: Partial<VideoProjectExportSettings>) => void;
  startExport: (jobId: string) => void;
  updateExportStatus: (status: VideoProjectExportStatus) => void;
  failExport: (error: string) => void;
  failExportCancellation: (error: string) => void;
  completeExport: (result: VideoEditorExportResult) => void;
  cancelExport: () => void;
}
