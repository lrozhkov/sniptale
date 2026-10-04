import type { GalleryItem } from '../items';

export interface GalleryDeletionOpening {
  anchor: HTMLElement | null;
  keyboard: boolean;
}

export interface GalleryPreparedDeletion {
  warning: string;
  confirm: () => Promise<boolean>;
}

/** One disposable request; persistence owners independently revalidate every destructive commit. */
export interface GalleryDeletionRequest extends GalleryDeletionOpening {
  contextKey: string;
  targets: readonly GalleryItem[];
  moveToTrash: (() => Promise<boolean>) | null;
  preparePermanent: () => Promise<GalleryPreparedDeletion | null>;
}

export function getGalleryDeletionContextKey(
  selectedItems: readonly GalleryItem[],
  previewItem: GalleryItem | null
): string {
  return JSON.stringify([selectedItems.map((item) => item.id).sort(), previewItem?.id ?? null]);
}
