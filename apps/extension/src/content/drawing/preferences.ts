import {
  synchronizeDrawingToolPreferences,
  type DrawingSession,
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
} from '../../composition/persistence/drawing-palette/tool-preferences';

interface ContentDrawingPreferenceTarget {
  readonly session: Pick<DrawingSession, 'getSnapshot' | 'setDefaults' | 'subscribe'>;
  applyPalette(colors: readonly string[]): void;
}

export function synchronizeContentDrawingPreferences(
  controller: ContentDrawingPreferenceTarget
): () => void {
  let active = true;
  let observedPaletteChange = false;
  const stopPreferences = synchronizeDrawingToolPreferences({
    getDefaults: () => controller.session.getSnapshot().defaults,
    load: loadDrawingToolPreferences,
    reportSaveFailure: () =>
      showToast(translate('content.toolbar.drawingPreferencesSaveError'), 'error'),
    save: saveDrawingToolPreferences,
    setDefaults: (defaults) => controller.session.setDefaults(defaults),
    subscribeAuthoritative: subscribeToDrawingToolPreferences,
    subscribeDefaults: (listener) => controller.session.subscribe(listener),
  });
  const stopPalette = subscribeToDrawingPaletteState((state) => {
    observedPaletteChange = true;
    if (active) controller.applyPalette(state.colors);
  });
  void loadDrawingPaletteState()
    .then((state) => {
      if (active && !observedPaletteChange) controller.applyPalette(state.colors);
    })
    .catch(() => undefined);

  return () => {
    active = false;
    stopPalette();
    stopPreferences();
  };
}
