import { useEffect } from 'react';
import {
  synchronizeDrawingToolPreferences,
  type DrawingToolDefaults,
} from '../../features/drawing/public';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../platform/i18n';
import {
  loadDrawingToolPreferences,
  saveDrawingToolPreferences,
  subscribeToDrawingToolPreferences,
} from '../../composition/persistence/drawing-palette/tool-preferences';
import { useEditorStore } from '../state/useEditorStore';

function getEditorDrawingToolDefaults(): DrawingToolDefaults {
  const settings = useEditorStore.getState().toolSettings;
  return {
    pencil: settings.pencil,
    marker: settings.marker,
    shape: settings.shape,
    arrow: settings.arrow,
    text: settings.text,
  };
}

export function synchronizeEditorDrawingPreferences(): () => void {
  return synchronizeDrawingToolPreferences({
    getDefaults: getEditorDrawingToolDefaults,
    load: loadDrawingToolPreferences,
    reportSaveFailure: () =>
      showToast(translate('content.toolbar.drawingPreferencesSaveError'), 'error'),
    save: saveDrawingToolPreferences,
    setDefaults: (defaults) => useEditorStore.getState().replaceDrawingToolSettings(defaults),
    subscribeAuthoritative: subscribeToDrawingToolPreferences,
    subscribeDefaults: (listener) =>
      useEditorStore.subscribe((state, previous) => {
        if (state.toolSettings !== previous.toolSettings) listener();
      }),
  });
}

export function useEditorDrawingPreferencesSynchronization(): void {
  useEffect(() => synchronizeEditorDrawingPreferences(), []);
}
