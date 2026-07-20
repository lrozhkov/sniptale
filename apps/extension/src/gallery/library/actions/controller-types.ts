import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  MediaHubBackupExportOptions,
  MediaHubBackupSummary,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import type { GalleryItem } from '../items';
import type { GalleryPreviewSessionState } from '../types';

interface PendingImportState {
  file: File;
  summary: MediaHubBackupSummary;
}

interface PendingExportState {
  options: MediaHubBackupExportOptions;
  summary: MediaHubLocalBackupSummary;
}

interface GalleryConfirmDialogState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => Promise<void>;
}

interface GalleryActionPreviewDraftState {
  filename: string;
  hasChanges: boolean;
  tagInput: string;
  tags: string[];
}

interface GallerySelectionActionState {
  preview: {
    session: GalleryPreviewSessionState;
  };
  selection: {
    selectedItems: GalleryItem[];
    selectionTagDraft: string;
  };
}

interface GalleryPreviewActionState {
  preview: {
    draft: GalleryActionPreviewDraftState;
    session: GalleryPreviewSessionState;
  };
}

interface GalleryImportActionState {
  storage: {
    pendingImport: PendingImportState | null;
  };
}

interface GalleryBackupExportActionState {
  selection: {
    selectedItems: GalleryItem[];
  };
}

interface GallerySelectionControllerActions {
  selection: {
    setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectionTagDraft: Dispatch<SetStateAction<string>>;
  };
  preview: {
    setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>;
  };
  surface: {
    setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
  };
  storage: {
    refresh: () => Promise<void>;
  };
}

interface GalleryPreviewControllerActions {
  preview: {
    setFilenameDraft: Dispatch<SetStateAction<string>>;
    setPreview: Dispatch<SetStateAction<GalleryPreviewSessionState>>;
    setTagDraft: Dispatch<SetStateAction<string>>;
    setTagDrafts: Dispatch<SetStateAction<string[]>>;
  };
  storage: {
    refresh: () => Promise<void>;
  };
}

interface GalleryImportControllerActions {
  storage: {
    refresh: () => Promise<void>;
  };
  surface: {
    setPendingImport: Dispatch<SetStateAction<PendingImportState | null>>;
  };
}

interface GalleryBackupExportControllerActions {
  storage: {
    refresh: () => Promise<void>;
  };
  surface: {
    setPendingExport: Dispatch<SetStateAction<PendingExportState | null>>;
  };
}

export interface GallerySelectionController {
  actions: GallerySelectionControllerActions;
  state: GallerySelectionActionState;
}

export interface GalleryPreviewController {
  actions: GalleryPreviewControllerActions;
  state: GalleryPreviewActionState;
}

export interface GalleryImportController {
  actions: GalleryImportControllerActions;
  refs: {
    importInputRef: RefObject<HTMLInputElement | null>;
  };
  state: GalleryImportActionState;
}

export interface GalleryBackupExportController {
  actions: GalleryBackupExportControllerActions;
  state: GalleryBackupExportActionState;
}

export interface GallerySurfaceController {
  actions: {
    surface: {
      setBanner: Dispatch<SetStateAction<string | null>>;
      setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
      setIsBusy: Dispatch<SetStateAction<boolean>>;
      setPendingExport: Dispatch<SetStateAction<PendingExportState | null>>;
      setShowStorageManager: Dispatch<SetStateAction<boolean>>;
    };
  };
}
