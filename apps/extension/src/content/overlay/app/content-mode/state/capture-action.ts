import { useCallback, useRef, useState } from 'react';

import type { CaptureActionType } from '../../../../../contracts/settings';

export function useCaptureActionState() {
  const [captureAction, setCaptureActionState] = useState<CaptureActionType>('download_default');
  const captureActionRef = useRef<CaptureActionType>('download_default');
  const setCaptureAction = useCallback((action: CaptureActionType) => {
    captureActionRef.current = action;
    setCaptureActionState(action);
  }, []);

  return {
    captureAction,
    captureActionRef,
    setCaptureAction,
  };
}
