export const MIN_SELECTION_SIZE = 10;
export const OVERLAY_BACKGROUND =
  'color-mix(in srgb, var(--sniptale-color-overlay) 82%, transparent)';
export const Z_INDEX_BASE = 2147483644;

export function getMaxSelectionWidth(): number {
  return window.innerWidth;
}

export function getMaxSelectionHeight(): number {
  return window.innerHeight;
}
