import { useCallback } from 'react';
import type { GalleryAppState, GalleryAppStateController } from './types';
import type { GalleryItem } from '../library/items';
import { useGalleryLibraryState } from './useGalleryLibraryState';
import { useGallerySurfaceState } from './useGallerySurfaceState';

type GalleryStorageWorkflowState = Pick<
  GalleryAppState['storage'],
  | 'banner'
  | 'cleanupReport'
  | 'confirmDialog'
  | 'isBusy'
  | 'isLoading'
  | 'pendingExport'
  | 'pendingImport'
  | 'showStorageManager'
  | 'storageInfo'
>;

type GalleryStorageWorkflowActions = Pick<
  GalleryAppStateController['actions']['storage'] & GalleryAppStateController['actions']['surface'],
  | 'refresh'
  | 'setBanner'
  | 'setConfirmDialog'
  | 'setIsBusy'
  | 'setPendingExport'
  | 'setPendingImport'
  | 'setShowStorageManager'
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
    banner: surface.state.banner,
    cleanupReport: library.cleanupReport,
    confirmDialog: surface.state.confirmDialog,
    isBusy: surface.state.isBusy,
    isLoading: library.isLoading,
    pendingExport: surface.state.pendingExport,
    pendingImport: surface.state.pendingImport,
    showStorageManager: surface.state.showStorageManager,
    storageInfo: library.storageInfo,
  };
}

function buildGalleryStorageWorkflowActions(
  library: ReturnType<typeof useGalleryLibraryState>,
  surface: ReturnType<typeof useGallerySurfaceState>
): GalleryStorageWorkflowActions {
  return {
    refresh: library.refresh,
    setBanner: surface.actions.setBanner,
    setConfirmDialog: surface.actions.setConfirmDialog,
    setIsBusy: surface.actions.setIsBusy,
    setPendingExport: surface.actions.setPendingExport,
    setPendingImport: surface.actions.setPendingImport,
    setShowStorageManager: surface.actions.setShowStorageManager,
  };
}

export function useGalleryStorageWorkflow({
  setPreview,
  setSelectedIds,
}: UseGalleryStorageWorkflowOptions) {
  const surface = useGallerySurfaceState();
  const { setBanner, setShowStorageManager } = surface.actions;
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
  const storageManagerOpenHandler = useCallback(
    () => setShowStorageManager(true),
    [setShowStorageManager]
  );
  const library = useGalleryLibraryState({
    onBanner: setBanner,
    onPreviewItemRefresh: previewRefreshHandler,
    onSelectionRefresh: selectionRefreshHandler,
    onStorageManagerOpen: storageManagerOpenHandler,
  });

  return {
    actions: buildGalleryStorageWorkflowActions(library, surface),
    library,
    state: buildGalleryStorageWorkflowState(library, surface),
  };
}
