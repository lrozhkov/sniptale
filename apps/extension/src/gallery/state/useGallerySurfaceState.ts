import { useEffect, useState } from 'react';
import type {
  ActiveImportState,
  GalleryConfirmDialogState,
  PendingExportState,
  PendingImportState,
} from './types';

export function useGallerySurfaceState() {
  const [activeImport, setActiveImport] = useState<ActiveImportState | null>(null);
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
      setActiveImport,
      setBanner,
      setConfirmDialog,
      setIsBusy,
      setPendingExport,
      setPendingImport,
      setShowStorageManager,
    },
    state: {
      activeImport,
      banner,
      confirmDialog,
      isBusy,
      pendingExport,
      pendingImport,
      showStorageManager,
    },
  };
}
