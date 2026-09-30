import { useEffect, type RefObject } from 'react';
import type { GalleryItem } from '../items';
import type { GalleryDeletionOpening } from './types';

const ownKeyboardControlSelector = [
  'textarea',
  'select',
  'input:not([type="checkbox"])',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[aria-haspopup="listbox"]',
  '[aria-haspopup="menu"]',
  '[role="tablist"]',
  '[role="tree"]',
].join(',');

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
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest(ownKeyboardControlSelector)) return false;
  return Boolean(grid && (target === document.body || grid.contains(target)));
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
