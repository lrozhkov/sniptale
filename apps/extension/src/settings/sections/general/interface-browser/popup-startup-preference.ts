import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

import {
  DEFAULT_POPUP_STARTUP_STATE,
  loadPopupStartupState,
  savePopupStartupSelection,
  type PopupStartupSelection,
} from '../../../../composition/persistence/capture-settings/popup-startup';
import { translate } from '../../../../platform/i18n';

const logger = createLogger({ namespace: 'settings:popup-startup' });

export function usePopupStartupPreference() {
  const [selection, setSelection] = useState<PopupStartupSelection>(
    DEFAULT_POPUP_STARTUP_STATE.selection
  );
  const [isLoading, setIsLoading] = useState(true);
  const committedSelectionRef = useRef<PopupStartupSelection>(
    DEFAULT_POPUP_STARTUP_STATE.selection
  );
  const latestSelectionRef = useRef<PopupStartupSelection>(DEFAULT_POPUP_STARTUP_STATE.selection);
  const revisionRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    void loadPopupStartupState()
      .then((state) => {
        if (!cancelled) {
          committedSelectionRef.current = state.selection;
          latestSelectionRef.current = state.selection;
          setSelection(state.selection);
        }
      })
      .catch((error) => {
        logger.error('Failed to load popup startup preference', error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSelection = useCallback(async (next: PopupStartupSelection) => {
    const revision = ++revisionRef.current;
    latestSelectionRef.current = next;
    setSelection(next);
    const operation = persistenceQueueRef.current.then(async () => {
      try {
        await savePopupStartupSelection(next);
        committedSelectionRef.current = next;
      } catch (error) {
        logger.error('Failed to persist popup startup preference', error);
        if (revisionRef.current === revision) {
          latestSelectionRef.current = committedSelectionRef.current;
          setSelection(committedSelectionRef.current);
        }
        toast.error(translate('common.states.error'));
      }
    });
    persistenceQueueRef.current = operation;
    await operation;
  }, []);

  return {
    popupStartupLoading: isLoading,
    popupStartupSelection: selection,
    updatePopupStartupSelection: updateSelection,
  };
}
