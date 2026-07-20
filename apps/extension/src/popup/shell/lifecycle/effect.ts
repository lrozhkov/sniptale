import { useEffect, useRef } from 'react';
import { setupPopupLifecycle, type PopupLifecycleParams } from './index';

export function usePopupLifecycleEffect(getParams: () => PopupLifecycleParams): void {
  const paramsRef = useRef(getParams);
  paramsRef.current = getParams;

  useEffect(() => {
    const cleanup = setupPopupLifecycle(() => paramsRef.current());
    return () => cleanup();
  }, []);
}
