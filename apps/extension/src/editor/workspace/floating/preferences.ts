import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE,
  loadEditorFloatingLayersPreference,
  saveEditorFloatingLayersPreference,
  type EditorFloatingLayersPreference,
} from '../../persistence/ui-state/floating-layers';
import { translate } from '../../../platform/i18n';

type FloatingLayersPreferencePatch = Partial<EditorFloatingLayersPreference>;

function useFloatingLayersPreferencePersistence(
  setSaveErrorMessage: (message: string | null) => void
) {
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const writeEpochRef = useRef(0);

  return useCallback(
    (nextPreference: EditorFloatingLayersPreference) => {
      const writeEpoch = writeEpochRef.current + 1;
      writeEpochRef.current = writeEpoch;
      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(() => saveEditorFloatingLayersPreference(nextPreference))
        .then(() => {
          if (writeEpochRef.current === writeEpoch) {
            setSaveErrorMessage(null);
          }
        })
        .catch(() => {
          if (writeEpochRef.current === writeEpoch) {
            setSaveErrorMessage(translate('editor.toolbar.layersPreferenceSaveFailed'));
          }
        });
      void writeQueueRef.current;
    },
    [setSaveErrorMessage]
  );
}

export function useFloatingLayersPreferenceState() {
  const [preference, setPreference] = useState<EditorFloatingLayersPreference>(
    DEFAULT_EDITOR_FLOATING_LAYERS_PREFERENCE
  );
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const userChangedRef = useRef(false);
  const persistPreference = useFloatingLayersPreferencePersistence(setSaveErrorMessage);

  const updatePreference = useCallback(
    (patch: FloatingLayersPreferencePatch) => {
      userChangedRef.current = true;
      setSaveErrorMessage(null);
      setPreference((current) => {
        const nextPreference = { ...current, ...patch };
        persistPreference(nextPreference);
        return nextPreference;
      });
    },
    [persistPreference]
  );

  useEffect(() => {
    let cancelled = false;

    void loadEditorFloatingLayersPreference().then((storedPreference) => {
      if (!cancelled && !userChangedRef.current) {
        setPreference(storedPreference);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    layersCollapsed: preference.collapsed,
    layersHeightRatio: preference.heightRatio,
    layersPreferenceError: saveErrorMessage,
    setLayersCollapsed: (collapsed: boolean) => updatePreference({ collapsed }),
    setLayersHeightRatio: (heightRatio: number | null) => updatePreference({ heightRatio }),
  };
}
