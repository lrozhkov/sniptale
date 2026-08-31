import type { ArchiveTransferProgress } from '../../composition/archive-transfer';
import type {
  MediaHubImportConflictStrategy,
  MediaHubImportResult,
} from '../../workflows/media-hub-backup/index';
import type { WebSnapshotImportInspection } from '../../workflows/page-package/import';

export interface ActiveImportState {
  file: File;
  failedFilenames?: string[];
  id: string;
  kind?: 'backup' | 'media-files';
  progress: ArchiveTransferProgress;
  result?: MediaHubImportResult;
  status: 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  strategy?: MediaHubImportConflictStrategy;
  totalBytes: number;
  totalRoots: number;
}

export type MediaFileImportConflictStrategy = 'skip' | 'duplicate';

export interface MediaFileImportConflict {
  filename: string;
  size: number;
}

export interface PendingMediaFileImportState {
  conflicts: MediaFileImportConflict[];
  files: File[];
}

export interface PendingWebSnapshotImportState {
  file: File;
  inspection: WebSnapshotImportInspection;
}
