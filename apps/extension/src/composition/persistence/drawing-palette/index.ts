import { parseColor, formatHexColor } from '@sniptale/foundation/color';
import { browserStorage } from '../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { DRAWING_PALETTE_STORAGE_KEY, type DrawingPaletteStateV1 } from './contracts';
import {
  cloneDrawingPaletteState,
  createDefaultDrawingPaletteState,
  parseDrawingPaletteState,
} from './parser';

export * from './contracts';
export { createDefaultDrawingPaletteState } from './parser';

let snapshot: DrawingPaletteStateV1 | null = null;

const cache = (state: DrawingPaletteStateV1) => {
  snapshot = cloneDrawingPaletteState(state);
  return cloneDrawingPaletteState(snapshot);
};

export async function loadDrawingPaletteState(): Promise<DrawingPaletteStateV1> {
  const stored = await browserStorage.local.get([DRAWING_PALETTE_STORAGE_KEY]);
  return cache(parseDrawingPaletteState(stored[DRAWING_PALETTE_STORAGE_KEY]).state);
}

export function getDrawingPaletteSnapshot(): DrawingPaletteStateV1 {
  return snapshot ? cloneDrawingPaletteState(snapshot) : createDefaultDrawingPaletteState();
}

export function subscribeToDrawingPaletteState(
  listener: (state: DrawingPaletteStateV1) => void
): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'local' || !(DRAWING_PALETTE_STORAGE_KEY in changes)) return;
    listener(cache(parseDrawingPaletteState(changes[DRAWING_PALETTE_STORAGE_KEY]?.newValue).state));
  });
}

type DrawingPaletteMutationResult = 'applied' | 'rejected';

function mutateDrawingPaletteState(
  mutate: (state: DrawingPaletteStateV1) => DrawingPaletteStateV1 | null
): Promise<DrawingPaletteMutationResult> {
  return runWithPersistenceDomainMutationLock('drawing-palette', async (permit) => {
    const stored = await browserStorage.local.get([DRAWING_PALETTE_STORAGE_KEY]);
    const current = parseDrawingPaletteState(stored[DRAWING_PALETTE_STORAGE_KEY]);
    if (current.unsafeForWrite) return 'rejected';
    const next = mutate(current.state);
    if (!next) return 'rejected';
    const parsed = parseDrawingPaletteState(next);
    if (parsed.unsafeForWrite) return 'rejected';
    await browserStorage.local.set(
      { [DRAWING_PALETTE_STORAGE_KEY]: cloneDrawingPaletteState(parsed.state) },
      permit
    );
    cache(parsed.state);
    return 'applied';
  });
}

function mutateDrawingPaletteColors(
  mutate: (colors: readonly string[]) => readonly string[] | null
): Promise<DrawingPaletteMutationResult> {
  return mutateDrawingPaletteState((state) => {
    const colors = mutate(state.colors);
    return colors ? { ...state, colors } : null;
  });
}

/** Names belong to RGB identities and are shared by every palette that uses that color. */
export function renamePaletteColor(
  color: string,
  name: string
): Promise<DrawingPaletteMutationResult> {
  const parsed = parseColor(color);
  if (!parsed) return Promise.resolve('rejected');
  const hex = formatHexColor(parsed).slice(0, 7).toLowerCase();
  return mutateDrawingPaletteState((state) => {
    const names = { ...state.names };
    if (name.trim()) names[hex] = name.trim();
    else delete names[hex];
    return {
      schemaVersion: 1,
      colors: state.colors,
      ...(Object.keys(names).length ? { names } : {}),
    };
  });
}

export function changeDrawingPaletteColor(
  index: number,
  color: string
): Promise<DrawingPaletteMutationResult> {
  return mutateDrawingPaletteColors((current) => {
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return null;
    return current.map((item, itemIndex) => (itemIndex === index ? color : item));
  });
}

export function reorderDrawingPaletteColor(
  itemIndex: number,
  beforeIndex: number | null
): Promise<DrawingPaletteMutationResult> {
  return mutateDrawingPaletteColors((current) => {
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= current.length) return null;
    if (
      beforeIndex !== null &&
      (!Number.isInteger(beforeIndex) || beforeIndex < 0 || beforeIndex >= current.length)
    ) {
      return null;
    }
    const colors = [...current];
    const [color] = colors.splice(itemIndex, 1);
    if (!color) return null;
    const insertionIndex =
      beforeIndex === null
        ? colors.length
        : beforeIndex > itemIndex
          ? beforeIndex - 1
          : beforeIndex;
    colors.splice(insertionIndex, 0, color);
    return colors;
  });
}
