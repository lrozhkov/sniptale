import { useEffect, useState } from 'react';
import type { GalleryConfirmDialogState, PendingExportState, PendingImportState } from './types';

export function useGallerySurfaceState() {
  const [showStorageManager, setShowStorageManager] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImportState | null>(null);
  const [pendingExport, setPendingExport] = useState<PendingExportState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<GalleryConfirmDialogState | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('storageManager') === '1') {
      setShowStorageManager(true);
    }
  }, []);

  return {
    actions: {
      setBanner,
      setConfirmDialog,
      setIsBusy,
      setPendingExport,
      setPendingImport,
      setShowStorageManager,
    },
    state: {
      banner,
      confirmDialog,
      isBusy,
      pendingExport,
      pendingImport,
      showStorageManager,
    },
  };
}
