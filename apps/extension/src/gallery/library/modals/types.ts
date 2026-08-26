import type {
  MediaHubBackupExportOptions,
  MediaHubLocalBackupSummary,
  MediaHubBackupSummary,
  MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
export interface ImportConflictModalProps {
  fixedStrategy?: MediaHubImportConflictStrategy;
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
