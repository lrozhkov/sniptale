import { galleryKeyboardMessages } from './keyboard';
import { galleryVideoReviewMessages } from './video-review';
import { defineMessageSource } from '../source';
import { galleryAppMessages } from './app';
import { galleryBackupExportModalMessages } from './backup-export-modal';
import { galleryImportModalMessages } from './import-modal';
import { galleryPreviewMessages } from './preview';
import { galleryRecoveryMessages } from './recovery';
import { galleryStorageErrorMessages } from './storage-errors';
import { galleryRecordingRecoveryMessages } from './recording-recovery';

export const galleryMessages = defineMessageSource({
  app: galleryAppMessages,
  keyboard: galleryKeyboardMessages,
  backupExportModal: galleryBackupExportModalMessages,
  preview: galleryPreviewMessages,
  videoReview: galleryVideoReviewMessages,
  recovery: galleryRecoveryMessages,
  recordingRecovery: galleryRecordingRecoveryMessages,
  storageErrors: galleryStorageErrorMessages,
  importModal: galleryImportModalMessages,
});
