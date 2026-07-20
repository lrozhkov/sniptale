import { useEffect } from 'react';

import type { PopupExportRuntimeContract } from './state';

function clearPopupExportCleanupTimeout(
  copyResetTimeoutRef: PopupExportRuntimeContract['copyResetTimeoutRef']
) {
  const timeoutId = copyResetTimeoutRef.current;
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
}

export function usePopupExportCleanup(
  copyResetTimeoutRef: PopupExportRuntimeContract['copyResetTimeoutRef']
) {
  useEffect(() => {
    return () => clearPopupExportCleanupTimeout(copyResetTimeoutRef);
  }, [copyResetTimeoutRef]);
}
