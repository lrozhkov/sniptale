import type {
  BackupExportModalProps,
  ImportConflictModalProps,
  StorageManagerModalProps,
} from './types';
import { BackupExportModalContent } from './backup-export-content';
import { ImportConflictModalContent } from './import-conflict-content';
import { StorageManagerModalContent } from './storage-manager-content';

export function StorageManagerModal(props: StorageManagerModalProps) {
  return <StorageManagerModalContent {...props} />;
}

export function ImportConflictModal(props: ImportConflictModalProps) {
  return <ImportConflictModalContent {...props} />;
}

export function BackupExportModal(props: BackupExportModalProps) {
  return <BackupExportModalContent {...props} />;
}
