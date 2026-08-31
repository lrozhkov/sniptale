import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [activeBlockingOperationCount, setActiveBlockingOperationCount] = useState(0);
  const activeBlockingOperationsRef = useRef(new Set<symbol>());
  const activeBackupExportRef = useRef<AbortController | null>(null);
  const beginBlockingOperation = useCallback(() => {
    const operationId = Symbol('gallery-blocking-operation');
    activeBlockingOperationsRef.current.add(operationId);
    setActiveBlockingOperationCount(activeBlockingOperationsRef.current.size);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeBlockingOperationsRef.current.delete(operationId);
      setActiveBlockingOperationCount(activeBlockingOperationsRef.current.size);
    };
  }, []);
  const replaceActiveBackupExport = useCallback((abortController: AbortController) => {
    activeBackupExportRef.current?.abort();
    activeBackupExportRef.current = abortController;
  }, []);
  const releaseActiveBackupExport = useCallback((abortController: AbortController) => {
    if (activeBackupExportRef.current === abortController) {
      activeBackupExportRef.current = null;
    }
  }, []);
  const cancelActiveBackupExport = useCallback(() => {
    activeBackupExportRef.current?.abort();
    activeBackupExportRef.current = null;
  }, []);

  useEffect(
    () => () => {
      activeBackupExportRef.current?.abort();
      activeBackupExportRef.current = null;
      activeBlockingOperationsRef.current.clear();
    },
    []
  );

  return {
    actions: {
      beginBlockingOperation,
      cancelActiveBackupExport,
      releaseActiveBackupExport,
      replaceActiveBackupExport,
      setActiveImport,
      setBanner,
      setConfirmDialog,
      setPendingExport,
      setPendingImport,
      setPendingMediaImport,
      setPendingWebSnapshotImport,
    },
    state: {
      activeImport,
      banner,
      confirmDialog,
      isBusy: activeBlockingOperationCount > 0,
      pendingExport,
      pendingImport,
      pendingMediaImport,
      pendingWebSnapshotImport,
    },
  };
}
