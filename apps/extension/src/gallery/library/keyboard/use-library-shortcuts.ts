import { useEffect, type RefObject } from 'react';
import {
  hasGalleryKeyboardLayer,
  hasGalleryPrimaryModifier,
  isGalleryListKeyboardTarget,
} from './context';

interface GalleryLibraryShortcutOptions {
  enabled: boolean;
  gridRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  selectedCount: number;
  onSelectAll(): void;
  onClearSelection(): void;
}

/** Capture checks layer priority before an inner Escape listener removes that layer. */
export function useGalleryLibraryShortcuts({
  enabled,
  gridRef,
  searchRef,
  selectedCount,
  onSelectAll,
  onClearSelection,
}: GalleryLibraryShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        hasGalleryKeyboardLayer()
      )
        return;
      const listTarget = isGalleryListKeyboardTarget(event.target, gridRef.current);
      if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey) {
        if (!listTarget || selectedCount === 0) return;
        event.preventDefault();
        onClearSelection();
        return;
      }
      if (!hasGalleryPrimaryModifier(event)) return;
      const key = event.code || event.key.toLowerCase();
      if (listTarget && (key === 'KeyA' || key === 'a')) {
        event.preventDefault();
        onSelectAll();
      } else if (
        (listTarget || event.target === searchRef.current) &&
        (key === 'KeyF' || key === 'f') &&
        searchRef.current
      ) {
        event.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, gridRef, searchRef, selectedCount, onSelectAll, onClearSelection]);
}
