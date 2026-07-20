import { Suspense } from 'react';

import type { PopupCommandPaletteRuntime } from '../runtime/types/command-palette';
import { LazyPopupCommandPalette } from '../lazy-chunks';

export function CommandPaletteLayer({
  isOpen,
  onClose,
  runtime,
}: {
  isOpen: boolean;
  onClose: () => void;
  runtime: PopupCommandPaletteRuntime;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyPopupCommandPalette isOpen={isOpen} onClose={onClose} runtime={runtime} />
    </Suspense>
  );
}
