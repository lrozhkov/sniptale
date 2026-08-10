import {
  createDefaultDrawingToolDefaults,
  type DrawingSession,
  type DrawingToolDefaults,
} from '../../features/drawing/public';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../platform/i18n';
import {
  loadDrawingPaletteState,
  subscribeToDrawingPaletteState,
} from '../../composition/persistence/drawing-palette';
import {
  loadDrawingToolPreferences,
  saveDrawingToolPreferences,
  subscribeToDrawingToolPreferences,
  type DrawingToolPreferencesPatch,
} from '../../composition/persistence/drawing-palette/tool-preferences';

interface DrawingPreferencesController {
  readonly session: DrawingSession;
  applyPalette(colors: readonly string[]): void;
  getPalette(): readonly string[];
}

function diffDrawingToolPreferences(
  before: DrawingToolDefaults,
  after: DrawingToolDefaults
): DrawingToolPreferencesPatch {
  return {
    ...(before.pencil === after.pencil ? {} : { pencil: after.pencil }),
    ...(before.marker === after.marker ? {} : { marker: after.marker }),
    ...(before.shape === after.shape ? {} : { shape: after.shape }),
    ...(before.arrow === after.arrow ? {} : { arrow: after.arrow }),
    ...(before.text === after.text ? {} : { text: after.text }),
  };
}

function mergeDrawingToolPreferences(
  defaults: DrawingToolDefaults,
  patch: DrawingToolPreferencesPatch
): DrawingToolDefaults {
  return {
    pencil: patch.pencil ?? defaults.pencil,
    marker: patch.marker ?? defaults.marker,
    shape: patch.shape ?? defaults.shape,
    arrow: patch.arrow ?? defaults.arrow,
    text: patch.text ?? defaults.text,
  };
}

function hasDrawingToolPreferencesPatch(patch: DrawingToolPreferencesPatch): boolean {
  return Boolean(patch.pencil || patch.marker || patch.shape || patch.arrow || patch.text);
}

function sameDrawingToolPreference(left: object, right: object): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function removeAcknowledgedDrawingToolPreferences(
  patch: DrawingToolPreferencesPatch,
  authoritative: DrawingToolDefaults
): DrawingToolPreferencesPatch {
  return {
    ...(patch.pencil && !sameDrawingToolPreference(patch.pencil, authoritative.pencil)
      ? { pencil: patch.pencil }
      : {}),
    ...(patch.marker && !sameDrawingToolPreference(patch.marker, authoritative.marker)
      ? { marker: patch.marker }
      : {}),
    ...(patch.shape && !sameDrawingToolPreference(patch.shape, authoritative.shape)
      ? { shape: patch.shape }
      : {}),
    ...(patch.arrow && !sameDrawingToolPreference(patch.arrow, authoritative.arrow)
      ? { arrow: patch.arrow }
      : {}),
    ...(patch.text && !sameDrawingToolPreference(patch.text, authoritative.text)
      ? { text: patch.text }
      : {}),
  };
}

function removeAppliedDrawingToolPreferences(
  pending: DrawingToolPreferencesPatch,
  applied: DrawingToolPreferencesPatch
): DrawingToolPreferencesPatch {
  return {
    ...(pending.pencil &&
    (!applied.pencil || !sameDrawingToolPreference(pending.pencil, applied.pencil))
      ? { pencil: pending.pencil }
      : {}),
    ...(pending.marker &&
    (!applied.marker || !sameDrawingToolPreference(pending.marker, applied.marker))
      ? { marker: pending.marker }
      : {}),
    ...(pending.shape &&
    (!applied.shape || !sameDrawingToolPreference(pending.shape, applied.shape))
      ? { shape: pending.shape }
      : {}),
    ...(pending.arrow &&
    (!applied.arrow || !sameDrawingToolPreference(pending.arrow, applied.arrow))
      ? { arrow: pending.arrow }
      : {}),
    ...(pending.text && (!applied.text || !sameDrawingToolPreference(pending.text, applied.text))
      ? { text: pending.text }
      : {}),
  };
}

export function synchronizeContentDrawingPreferences(
  controller: DrawingPreferencesController
): () => void {
  let active = true;
  let hydrated = false;
  let applyingStoredDefaults = false;
  let pendingPatch: DrawingToolPreferencesPatch = {};
  let pendingFallback = controller.session.getSnapshot().defaults;
  let saveFailureVisible = false;
  let observedPaletteChange = false;
  let observedPreferenceChange = false;
  let observedDefaults = controller.session.getSnapshot().defaults;
  const reportSaveFailure = () => {
    if (saveFailureVisible || !active) return;
    saveFailureVisible = true;
    showToast(translate('content.toolbar.drawingPreferencesSaveError'), 'error');
  };
  const persist = (patch: DrawingToolPreferencesPatch, fallback: DrawingToolDefaults) => {
    if (!hasDrawingToolPreferencesPatch(patch)) return;
    void saveDrawingToolPreferences(patch, fallback)
      .then((result) => {
        if (result === 'rejected') reportSaveFailure();
        else {
          pendingPatch = removeAppliedDrawingToolPreferences(pendingPatch, patch);
          saveFailureVisible = false;
        }
      })
      .catch(reportSaveFailure);
  };
  const applyStoredDefaults = (defaults: typeof observedDefaults) => {
    applyingStoredDefaults = true;
    controller.session.setDefaults(defaults);
    observedDefaults = controller.session.getSnapshot().defaults;
    applyingStoredDefaults = false;
  };
  const reconcileAuthoritativeDefaults = (
    defaults: DrawingToolDefaults,
    persistPending: boolean
  ) => {
    pendingPatch = removeAcknowledgedDrawingToolPreferences(pendingPatch, defaults);
    applyStoredDefaults(mergeDrawingToolPreferences(defaults, pendingPatch));
    hydrated = true;
    if (persistPending) persist(pendingPatch, defaults);
  };
  const unsubscribeSession = controller.session.subscribe(() => {
    const next = controller.session.getSnapshot().defaults;
    if (next === observedDefaults) return;
    const previous = observedDefaults;
    observedDefaults = next;
    if (applyingStoredDefaults) return;
    const patch = diffDrawingToolPreferences(previous, next);
    if (!hasDrawingToolPreferencesPatch(pendingPatch)) pendingFallback = previous;
    pendingPatch = { ...pendingPatch, ...patch };
    if (hydrated) persist(patch, previous);
  });
  const fallback = createDefaultDrawingToolDefaults(controller.getPalette());
  const unsubscribePreferences = subscribeToDrawingToolPreferences(fallback, (defaults) => {
    if (!active) return;
    observedPreferenceChange = true;
    reconcileAuthoritativeDefaults(defaults, !hydrated);
  });
  const unsubscribePalette = subscribeToDrawingPaletteState((state) => {
    observedPaletteChange = true;
    if (active) controller.applyPalette(state.colors);
  });
  void (async () => {
    try {
      const palette = await loadDrawingPaletteState();
      if (active && !observedPaletteChange) controller.applyPalette(palette.colors);
    } catch {
      // Keep the in-memory palette when local storage is unavailable.
    }
    try {
      const defaults = await loadDrawingToolPreferences(
        createDefaultDrawingToolDefaults(controller.getPalette())
      );
      if (active && !observedPreferenceChange) reconcileAuthoritativeDefaults(defaults, true);
    } catch {
      // Keep the in-memory defaults when local storage is unavailable.
    }
    if (!active || observedPreferenceChange) return;
    if (!hydrated) {
      hydrated = true;
      persist(pendingPatch, pendingFallback);
    }
  })();
  return () => {
    active = false;
    unsubscribePalette();
    unsubscribePreferences();
    unsubscribeSession();
  };
}
