import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  DEFAULT_SCREENSHOT_SETUP_STATE,
  loadScreenshotSetupState,
  patchScreenshotSetupState,
  type ScreenshotSetupState,
} from '../../../../composition/persistence/capture-settings';
import { translate } from '../../../../platform/i18n';

export function useScreenshotSetupState() {
  const [state, setState] = useState(DEFAULT_SCREENSHOT_SETUP_STATE);
  const [ready, setReady] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const committedRef = useRef(DEFAULT_SCREENSHOT_SETUP_STATE);
  const desiredRef = useRef(DEFAULT_SCREENSHOT_SETUP_STATE);
  const revisionRef = useRef(0);
  const failedPatchRef = useRef<Partial<ScreenshotSetupState>>({});
  const saveErrorRef = useRef<unknown>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void loadScreenshotSetupState()
      .then((stored) => {
        if (!active || revisionRef.current !== 0) return;
        committedRef.current = stored;
        desiredRef.current = stored;
        setState(stored);
      })
      .catch(() => toast.error(translate('common.states.error')))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<ScreenshotSetupState>) => {
    const revision = ++revisionRef.current;
    const desired = { ...desiredRef.current, ...patch };
    desiredRef.current = desired;
    setState(desired);
    setSavePending(true);

    const operation = queueRef.current.then(async () => {
      const mergedPatch = { ...failedPatchRef.current, ...patch };
      failedPatchRef.current = {};
      try {
        const persisted = await patchScreenshotSetupState(mergedPatch);
        committedRef.current = persisted;
        saveErrorRef.current = null;
        if (revisionRef.current === revision) {
          desiredRef.current = persisted;
          setState(persisted);
        }
      } catch (error) {
        saveErrorRef.current = error;
        if (revisionRef.current === revision) {
          desiredRef.current = committedRef.current;
          setState(committedRef.current);
        } else {
          failedPatchRef.current = { ...mergedPatch, ...failedPatchRef.current };
        }
        toast.error(translate('common.states.error'));
      }
    });
    queueRef.current = operation;
    void operation.then(() => {
      if (queueRef.current === operation) setSavePending(false);
    });
  }, []);

  const flush = useCallback(async (): Promise<ScreenshotSetupState> => {
    let observed: Promise<void>;
    do {
      observed = queueRef.current;
      await observed;
    } while (observed !== queueRef.current);
    if (saveErrorRef.current) throw saveErrorRef.current;
    return committedRef.current;
  }, []);

  return { flush, ready, savePending, state, update };
}
