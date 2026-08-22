import type { ArchiveTransferProgress } from '../../composition/archive-transfer';
import type {
  MediaHubImportConflictStrategy,
  MediaHubImportResult,
} from '../../workflows/media-hub-backup/index';

export interface ActiveImportState {
  file: File;
  id: string;
  progress: ArchiveTransferProgress;
  result?: MediaHubImportResult;
  status: 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  strategy: MediaHubImportConflictStrategy;
  totalBytes: number;
  totalRoots: number;
}
