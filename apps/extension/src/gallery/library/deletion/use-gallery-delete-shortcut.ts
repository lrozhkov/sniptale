import { useEffect, type RefObject } from 'react';
import type { GalleryItem } from '../items';
import type { GalleryDeletionOpening } from './types';
import { hasGalleryKeyboardLayer, isGalleryListKeyboardTarget } from '../keyboard/context';

function canHandleGalleryDelete(event: KeyboardEvent, grid: HTMLElement | null): boolean {
  if (
    event.key !== 'Delete' ||
    event.repeat ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return false;
  return !hasGalleryKeyboardLayer() && isGalleryListKeyboardTarget(event.target, grid);
}

export function useGalleryDeleteShortcut({
  enabled,
  selectedItems,
  gridRef,
  onDelete,
}: {
  enabled: boolean;
  selectedItems: GalleryItem[];
  gridRef: RefObject<HTMLDivElement | null>;
  onDelete: (items: GalleryItem[], opening?: GalleryDeletionOpening) => void;
}) {
  useEffect(() => {
    if (!enabled || selectedItems.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canHandleGalleryDelete(event, gridRef.current)) return;
      event.preventDefault();
      onDelete(selectedItems, {
        anchor: event.target === document.body ? gridRef.current : (event.target as HTMLElement),
        keyboard: true,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, selectedItems, gridRef, onDelete]);
}
