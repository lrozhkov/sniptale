import { useEffect, useRef } from 'react';
import type { PopupLifecycleParams } from './contracts';
import { setupPopupLifecycle } from './setup';

export function usePopupLifecycleEffect(getParams: () => PopupLifecycleParams): void {
  const paramsRef = useRef(getParams);
  paramsRef.current = getParams;

  useEffect(() => {
    const cleanup = setupPopupLifecycle(() => paramsRef.current());
    return () => cleanup();
  }, []);
}
