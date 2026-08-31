import { useCallback } from 'react';
import type { GalleryAppState, GalleryAppStateController } from './types';
import type { GalleryItem } from '../library/items';
import { useGalleryLibraryState } from './useGalleryLibraryState';
import { useGallerySurfaceState } from './useGallerySurfaceState';

type GalleryStorageWorkflowState = Pick<
  GalleryAppState['storage'],
  | 'activeImport'
  | 'banner'
  | 'confirmDialog'
  | 'isBusy'
  | 'isLoading'
  | 'pendingExport'
  | 'pendingImport'
  | 'pendingMediaImport'
  | 'pendingWebSnapshotImport'
  | 'storageInfo'
>;

type GalleryStorageWorkflowActions = Pick<
  GalleryAppStateController['actions']['storage'] & GalleryAppStateController['actions']['surface'],
  | 'refresh'
  | 'beginBlockingOperation'
  | 'cancelActiveBackupExport'
  | 'releaseActiveBackupExport'
  | 'replaceActiveBackupExport'
  | 'setActiveImport'
  | 'setBanner'
  | 'setConfirmDialog'
  | 'setPendingExport'
  | 'setPendingImport'
  | 'setPendingMediaImport'
  | 'setPendingWebSnapshotImport'
>;

interface UseGalleryStorageWorkflowOptions {
  setPreview: GalleryAppStateController['actions']['preview']['setPreview'];
  setSelectedIds: GalleryAppStateController['actions']['selection']['setSelectedIds'];
}

function buildGalleryStorageWorkflowState(
  library: ReturnType<typeof useGalleryLibraryState>,
  surface: ReturnType<typeof useGallerySurfaceState>
): GalleryStorageWorkflowState {
  return {
    activeImport: surface.state.activeImport,
    banner: surface.state.banner,
    confirmDialog: surface.state.confirmDialog,
    isBusy: surface.state.isBusy,
    isLoading: library.isLoading,
    pendingExport: surface.state.pendingExport,
    pendingImport: surface.state.pendingImport,
    pendingMediaImport: surface.state.pendingMediaImport,
    pendingWebSnapshotImport: surface.state.pendingWebSnapshotImport,
    storageInfo: library.storageInfo,
  };
}

function buildGalleryStorageWorkflowActions(
  library: ReturnType<typeof useGalleryLibraryState>,
  surface: ReturnType<typeof useGallerySurfaceState>
): GalleryStorageWorkflowActions {
  return {
    beginBlockingOperation: surface.actions.beginBlockingOperation,
    cancelActiveBackupExport: surface.actions.cancelActiveBackupExport,
    releaseActiveBackupExport: surface.actions.releaseActiveBackupExport,
    replaceActiveBackupExport: surface.actions.replaceActiveBackupExport,
    setActiveImport: surface.actions.setActiveImport,
    refresh: library.refresh,
    setBanner: surface.actions.setBanner,
    setConfirmDialog: surface.actions.setConfirmDialog,
    setPendingExport: surface.actions.setPendingExport,
    setPendingImport: surface.actions.setPendingImport,
    setPendingMediaImport: surface.actions.setPendingMediaImport,
    setPendingWebSnapshotImport: surface.actions.setPendingWebSnapshotImport,
  };
}

export function useGalleryStorageWorkflow({
  setPreview,
  setSelectedIds,
}: UseGalleryStorageWorkflowOptions) {
  const surface = useGallerySurfaceState();
  const { setBanner } = surface.actions;
  const previewRefreshHandler = useCallback(
    (items: GalleryItem[]) => {
      setPreview((previous) => {
        const previewItem = previous.item;

        return {
          ...previous,
          item: previewItem ? (items.find((item) => item.id === previewItem.id) ?? null) : null,
          url: null,
        };
      });
    },
    [setPreview]
  );
  const selectionRefreshHandler = useCallback(
    (items: GalleryItem[]) => {
      const itemIds = new Set(items.map((item) => item.id));

      setSelectedIds(
        (previous) => new Set(Array.from(previous).filter((assetId) => itemIds.has(assetId)))
      );
    },
    [setSelectedIds]
  );
  const library = useGalleryLibraryState({
    onBanner: setBanner,
    onPreviewItemRefresh: previewRefreshHandler,
    onSelectionRefresh: selectionRefreshHandler,
  });

  return {
    actions: buildGalleryStorageWorkflowActions(library, surface),
    library,
    state: buildGalleryStorageWorkflowState(library, surface),
  };
}
