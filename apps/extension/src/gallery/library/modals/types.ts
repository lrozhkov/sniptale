import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
  MediaHubBackupSummary,
  MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
import type { StorageCleanupGroup, StorageCleanupReport } from '../../../features/media-hub/types';

export interface StorageManagerModalProps {
  report: StorageCleanupReport | null;
  onClose: () => void;
  onRun: (group: StorageCleanupGroup) => Promise<void>;
}

export interface ImportConflictModalProps {
  summary: MediaHubBackupSummary;
  onClose: () => void;
  onImport: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
}

export interface BackupExportModalProps {
  options: MediaHubBackupExportOptions;
  summary: MediaHubLocalBackupSummary;
  onClose: () => void;
  onExport: (options: MediaHubBackupExportOptions) => Promise<void>;
  onInspect: (options: MediaHubBackupExportOptions) => Promise<MediaHubLocalBackupSummary>;
}
