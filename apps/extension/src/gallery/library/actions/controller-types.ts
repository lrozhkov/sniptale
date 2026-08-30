import type { Dispatch, RefObject, SetStateAction } from 'react';
import type {
  MediaHubBackupExportOptions,
  MediaHubBackupSummary,
  MediaHubImportConflictStrategy,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import type { GalleryItem } from '../items';
import type { GalleryPreviewSessionState } from '../types';
import type { ActiveImportState } from '../import-types';
import type { PendingMediaFileImportState } from '../import-types';
import type { PendingWebSnapshotImportState } from '../import-types';

interface PendingImportState {
  file: File;
  resumeOperationId?: string;
  resumeStrategy?: MediaHubImportConflictStrategy;
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
  derived: {
    allItems: GalleryItem[];
  };
  storage: {
    activeImport: ActiveImportState | null;
    pendingImport: PendingImportState | null;
    pendingMediaImport: PendingMediaFileImportState | null;
    pendingWebSnapshotImport: PendingWebSnapshotImportState | null;
  };
}

interface GalleryBackupExportActionState {
  selection: {
    selectedItems: GalleryItem[];
  };
  storage: {
    activeImport: ActiveImportState | null;
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
  surface: {
    setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
  };
}

interface GalleryImportControllerActions {
  filters: {
    reloadSavedViews: () => Promise<void>;
  };
  storage: {
    refresh: () => Promise<void>;
  };
  surface: {
    setActiveImport: Dispatch<SetStateAction<ActiveImportState | null>>;
    setBanner: Dispatch<SetStateAction<string | null>>;
    setPendingImport: Dispatch<SetStateAction<PendingImportState | null>>;
    setPendingMediaImport: Dispatch<SetStateAction<PendingMediaFileImportState | null>>;
    setPendingWebSnapshotImport: Dispatch<SetStateAction<PendingWebSnapshotImportState | null>>;
  };
}

interface GalleryBackupExportControllerActions {
  storage: {
    refresh: () => Promise<void>;
  };
  surface: {
    cancelActiveBackupExport: () => void;
    releaseActiveBackupExport: (abortController: AbortController) => void;
    replaceActiveBackupExport: (abortController: AbortController) => void;
    setBanner: Dispatch<SetStateAction<string | null>>;
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
    importTriggerRef: RefObject<HTMLButtonElement | null>;
    mediaImportInputRef: RefObject<HTMLInputElement | null>;
    mediaImportTriggerRef: RefObject<HTMLButtonElement | null>;
    webSnapshotImportInputRef: RefObject<HTMLInputElement | null>;
    webSnapshotImportTriggerRef: RefObject<HTMLButtonElement | null>;
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
      beginBlockingOperation: () => () => void;
      setBanner: Dispatch<SetStateAction<string | null>>;
      setConfirmDialog: Dispatch<SetStateAction<GalleryConfirmDialogState | null>>;
      setPendingExport: Dispatch<SetStateAction<PendingExportState | null>>;
    };
  };
}
