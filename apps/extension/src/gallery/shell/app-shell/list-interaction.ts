import type { GalleryAppState } from '../../state/types';

/** One admission boundary for Library list commands while a workflow or preview owns input. */
export function isGalleryListInteractionEnabled(
  state: Pick<GalleryAppState, 'storage' | 'preview'>
): boolean {
  const storage = state.storage;
  return (
    !storage.isBusy &&
    !storage.isLoading &&
    !storage.confirmDialog &&
    !storage.deletionRequest &&
    !storage.pendingImport &&
    !storage.pendingMediaImport &&
    !storage.pendingWebSnapshotImport &&
    !storage.pendingExport &&
    !storage.activeImport &&
    !state.preview.session.item
  );
}
