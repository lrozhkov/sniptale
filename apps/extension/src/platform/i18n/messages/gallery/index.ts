import { defineMessageSource } from '../source';
import { galleryAppMessages } from './app';
import { galleryBackupExportModalMessages } from './backup-export-modal';
import { galleryImportModalMessages } from './import-modal';
import { galleryPreviewMessages } from './preview';
import { galleryRecoveryMessages } from './recovery';
import { galleryStorageManagerMessages } from './storage-manager';

export const galleryMessages = defineMessageSource({
  app: galleryAppMessages,
  backupExportModal: galleryBackupExportModalMessages,
  preview: galleryPreviewMessages,
  recovery: galleryRecoveryMessages,
  storageManager: galleryStorageManagerMessages,
  importModal: galleryImportModalMessages,
});
