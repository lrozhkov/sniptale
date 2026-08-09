// policyStateId: drawing-palette-mutation-queue - durable local storage is authoritative;
// this disposable queue only preserves mutation order within one runtime.
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
let queue: Promise<void> = Promise.resolve();

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

function mutateDrawingPaletteColors(
  mutate: (colors: readonly string[]) => readonly string[] | null
): Promise<DrawingPaletteMutationResult> {
  const run = queue
    .catch(() => undefined)
    .then(() =>
      runWithPersistenceDomainMutationLock('drawing-palette', async (permit) => {
        const stored = await browserStorage.local.get([DRAWING_PALETTE_STORAGE_KEY]);
        const current = parseDrawingPaletteState(stored[DRAWING_PALETTE_STORAGE_KEY]);
        if (current.unsafeForWrite) return 'rejected' as const;
        const colors = mutate(current.state.colors);
        if (!colors) return 'rejected' as const;
        const parsed = parseDrawingPaletteState({ schemaVersion: 1, colors: [...colors] });
        if (parsed.unsafeForWrite) return 'rejected' as const;
        await browserStorage.local.set(
          { [DRAWING_PALETTE_STORAGE_KEY]: cloneDrawingPaletteState(parsed.state) },
          permit
        );
        cache(parsed.state);
        return 'applied' as const;
      })
    );
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
