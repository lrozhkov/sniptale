import { useState } from 'react';
import type {
  ActiveImportState,
  GalleryConfirmDialogState,
  PendingExportState,
  PendingImportState,
} from './types';
import type {
  PendingMediaFileImportState,
  PendingWebSnapshotImportState,
} from '../library/import-types';

export function useGallerySurfaceState() {
  const [activeImport, setActiveImport] = useState<ActiveImportState | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [pendingMediaImport, setPendingMediaImport] = useState<PendingMediaFileImportState | null>(
    null
  );
  const [pendingExport, setPendingExport] = useState<PendingExportState | null>(null);
  const [pendingWebSnapshotImport, setPendingWebSnapshotImport] =
    useState<PendingWebSnapshotImportState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<GalleryConfirmDialogState | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  return {
    actions: {
      setActiveImport,
      setBanner,
      setConfirmDialog,
      setIsBusy,
      setPendingExport,
      setPendingImport,
      setPendingMediaImport,
      setPendingWebSnapshotImport,
    },
    state: {
      activeImport,
      banner,
      confirmDialog,
      isBusy,
      pendingExport,
      pendingImport,
      pendingMediaImport,
      pendingWebSnapshotImport,
    },
  };
}
