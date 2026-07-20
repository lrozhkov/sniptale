import type {
  MediaHubBackupExportOptions,
  MediaHubImportConflictStrategy,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import type { StorageCleanupGroup } from '../../../features/media-hub/types';
import type { GalleryItem } from '../items';

export interface UseGalleryAppActionsResult {
  backup: {
    closePendingExport: () => void;
    confirmExport: (options: MediaHubBackupExportOptions) => Promise<void>;
    exportBackup: () => Promise<void>;
    inspectExport: (options: MediaHubBackupExportOptions) => Promise<MediaHubLocalBackupSummary>;
  };
  importing: {
    importBackup: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
    importSelectedFile: (file: File | null) => Promise<void>;
  };
  preview: {
    close: () => Promise<void>;
    copy: () => void;
    download: () => void;
    openInEditor: (item: GalleryItem) => void;
    openSnapshotScreenshotInEditor: () => void;
    resetChanges: () => void;
    saveMetadata: () => Promise<void>;
  };
  selection: {
    applyTag: () => Promise<void>;
    deleteMany: (targets: GalleryItem[]) => Promise<void>;
    downloadZip: () => Promise<void>;
  };
  storage: {
    cleanup: (group: StorageCleanupGroup) => Promise<void>;
  };
}
