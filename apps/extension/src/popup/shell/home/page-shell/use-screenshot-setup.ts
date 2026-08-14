import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  DEFAULT_SCREENSHOT_SETUP_STATE,
  loadScreenshotSetupState,
  patchScreenshotSetupState,
  type ScreenshotSetupState,
  type ScreenshotSetupMode,
} from '../../../../composition/persistence/capture-settings';
import { translate } from '../../../../platform/i18n';

export function useScreenshotSetupState(
  startupMode: ScreenshotSetupMode | null = null,
  onStartupModeCleared?: () => void,
  initialState: ScreenshotSetupState = DEFAULT_SCREENSHOT_SETUP_STATE
) {
  const operationalInitialState = startupMode
    ? { ...initialState, selectedMode: startupMode }
    : initialState;
  const [state, setState] = useState(operationalInitialState);
  const [ready] = useState(true);
  const [savePending, setSavePending] = useState(false);
  const committedRef = useRef(initialState);
  const desiredRef = useRef(operationalInitialState);
  const revisionRef = useRef(0);
  const failedPatchRef = useRef<Partial<ScreenshotSetupState>>({});
  const saveErrorRef = useRef<unknown>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const startupModeRef = useRef(startupMode);
  const startupModeSupersededRef = useRef(false);

  useEffect(() => {
    if (startupModeSupersededRef.current) return;
    startupModeRef.current = startupMode;
    if (!startupMode) return;
    const operational = { ...desiredRef.current, selectedMode: startupMode };
    desiredRef.current = operational;
    setState(operational);
  }, [startupMode]);

  useEffect(() => {
    let active = true;
    void loadScreenshotSetupState()
      .then((stored) => {
        if (!active || revisionRef.current !== 0) return;
        const operational = startupModeRef.current
          ? { ...stored, selectedMode: startupModeRef.current }
          : stored;
        committedRef.current = stored;
        desiredRef.current = operational;
        setState(operational);
      })
      .catch(() => toast.error(translate('common.states.error')));
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(
    (patch: Partial<ScreenshotSetupState>) => {
      if (Object.prototype.hasOwnProperty.call(patch, 'selectedMode')) {
        startupModeSupersededRef.current = true;
        startupModeRef.current = null;
        onStartupModeCleared?.();
      }
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
            const operational = startupModeRef.current
              ? { ...persisted, selectedMode: startupModeRef.current }
              : persisted;
            desiredRef.current = operational;
            setState(operational);
          }
        } catch (error) {
          saveErrorRef.current = error;
          if (revisionRef.current === revision) {
            const operational = startupModeRef.current
              ? { ...committedRef.current, selectedMode: startupModeRef.current }
              : committedRef.current;
            desiredRef.current = operational;
            setState(operational);
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
    },
    [onStartupModeCleared]
  );

  const flush = useCallback(async (): Promise<ScreenshotSetupState> => {
    let observed: Promise<void>;
    do {
      observed = queueRef.current;
      await observed;
    } while (observed !== queueRef.current);
    if (saveErrorRef.current) throw saveErrorRef.current;
    return startupModeRef.current
      ? { ...committedRef.current, selectedMode: startupModeRef.current }
      : committedRef.current;
  }, []);

  return { flush, ready, savePending, state, update };
}
