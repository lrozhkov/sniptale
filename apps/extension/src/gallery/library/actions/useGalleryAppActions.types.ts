import type {
  MediaHubBackupExportOptions,
  MediaHubImportConflictStrategy,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import type { GalleryItem } from '../items';
import type { MediaFileImportConflictStrategy } from '../import-types';

export interface UseGalleryAppActionsResult {
  backup: {
    closePendingExport: () => void;
    confirmExport: (options: MediaHubBackupExportOptions) => Promise<void>;
    exportBackup: () => Promise<void>;
    inspectExport: (options: MediaHubBackupExportOptions) => Promise<MediaHubLocalBackupSummary>;
  };
  importing: {
    cancelActiveImport: () => void;
    closePendingImport: () => void;
    closePendingMediaImport: () => void;
    closePendingWebSnapshotImport: () => void;
    confirmWebSnapshotImport: () => Promise<void>;
    confirmMediaFileImport: (strategy: MediaFileImportConflictStrategy) => Promise<void>;
    dismissActiveImport: () => void;
    importBackup: (strategy: MediaHubImportConflictStrategy) => Promise<void>;
    importSelectedFile: (file: File | null) => Promise<void>;
    importMediaFiles: (files: File[]) => Promise<void>;
    inspectWebSnapshot: (file: File | null) => Promise<void>;
  };
  preview: {
    close: () => Promise<void>;
    copy: () => void;
    download: () => void;
    downloadOriginal: () => void;
    navigate: (target: GalleryItem) => Promise<void>;
    openInEditor: (item: GalleryItem) => void;
    openSnapshotScreenshotInEditor: () => void;
    resetChanges: () => void;
    restoreOriginal: () => void;
    saveCopy: () => void;
    saveMetadata: () => Promise<void>;
  };
  selection: {
    applyTag: (tag?: string) => Promise<void>;
    deleteMany: (targets: GalleryItem[]) => Promise<void>;
    downloadBackup: () => Promise<void>;
    downloadZip: () => Promise<void>;
  };
}
