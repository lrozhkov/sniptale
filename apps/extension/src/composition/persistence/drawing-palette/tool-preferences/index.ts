// policyStateId: drawing-palette-mutation-queue - durable local storage is authoritative;
// this disposable queue only preserves per-tool preference mutation order within one runtime.
import type { DrawingToolDefaults } from '../../../../features/drawing/public';
import { browserStorage } from '../../infrastructure/browser-storage';
import { runWithPersistenceDomainMutationLock } from '../../infrastructure/mutation-barrier';
import { cloneDrawingToolDefaults, parseDrawingToolPreferences } from './parser';

export const DRAWING_TOOL_PREFERENCES_STORAGE_KEY = 'sniptale_drawing_tool_preferences';

let queue: Promise<void> = Promise.resolve();

export async function loadDrawingToolPreferences(
  fallback: DrawingToolDefaults
): Promise<DrawingToolDefaults> {
  const stored = await browserStorage.local.get([DRAWING_TOOL_PREFERENCES_STORAGE_KEY]);
  return parseDrawingToolPreferences(stored[DRAWING_TOOL_PREFERENCES_STORAGE_KEY], fallback)
    .defaults;
}

export function subscribeToDrawingToolPreferences(
  fallback: DrawingToolDefaults,
  listener: (defaults: DrawingToolDefaults) => void
): () => void {
  if (!browserStorage.canObserveChanges()) return () => undefined;
  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'local' || !(DRAWING_TOOL_PREFERENCES_STORAGE_KEY in changes)) return;
    const parsed = parseDrawingToolPreferences(
      changes[DRAWING_TOOL_PREFERENCES_STORAGE_KEY]?.newValue,
      fallback
    );
    if (!parsed.unsafeForWrite) listener(parsed.defaults);
  });
}

type DrawingToolPreferencesMutationResult = 'applied' | 'rejected';

export type DrawingToolPreferencesPatch = {
  [Tool in keyof DrawingToolDefaults]?: DrawingToolDefaults[Tool];
};

function mergeDrawingToolPreferences(
  current: DrawingToolDefaults,
  patch: DrawingToolPreferencesPatch
): DrawingToolDefaults {
  return {
    pencil: patch.pencil ?? current.pencil,
    marker: patch.marker ?? current.marker,
    shape: patch.shape ?? current.shape,
    arrow: patch.arrow ?? current.arrow,
    text: patch.text ?? current.text,
  };
}

export function saveDrawingToolPreferences(
  patch: DrawingToolPreferencesPatch,
  fallback: DrawingToolDefaults
): Promise<DrawingToolPreferencesMutationResult> {
  const requested = parseDrawingToolPreferences(
    { schemaVersion: 1, defaults: mergeDrawingToolPreferences(fallback, patch) },
    fallback
  );
  if (requested.unsafeForWrite) return Promise.resolve('rejected');
  const run = queue
    .catch(() => undefined)
    .then(() =>
      runWithPersistenceDomainMutationLock('drawing-tool-preferences', async (permit) => {
        const stored = await browserStorage.local.get([DRAWING_TOOL_PREFERENCES_STORAGE_KEY]);
        const current = parseDrawingToolPreferences(
          stored[DRAWING_TOOL_PREFERENCES_STORAGE_KEY],
          fallback
        );
        if (current.unsafeForWrite) return 'rejected' as const;
        const next = parseDrawingToolPreferences(
          {
            schemaVersion: 1,
            defaults: mergeDrawingToolPreferences(current.defaults, patch),
          },
          current.defaults
        );
        if (next.unsafeForWrite) return 'rejected' as const;
        await browserStorage.local.set(
          {
            [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
              schemaVersion: 1,
              defaults: cloneDrawingToolDefaults(next.defaults),
            },
          },
          permit
        );
        return 'applied' as const;
      })
    );
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
