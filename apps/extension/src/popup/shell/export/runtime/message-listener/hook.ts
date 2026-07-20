import { useEffect } from 'react';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { applyPopupExportRuntimeMessage } from './apply';
import { parsePopupExportRuntimeMessage } from './parse';
import type { PopupExportRuntimeContract } from '../types';

export function usePopupExportMessageListener(state: PopupExportRuntimeContract) {
  const { requestIdRef, setProgress, setResult } = state;

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      const typedMessage = parsePopupExportRuntimeMessage(message);
      if (!typedMessage) {
        return;
      }

      applyPopupExportRuntimeMessage({
        message: typedMessage,
        requestId: requestIdRef.current,
        setProgress,
        setResult,
        clearRequestId: () => {
          requestIdRef.current = null;
        },
      });
    };

    return browserRuntime.subscribeToMessages(handleMessage);
  }, [requestIdRef, setProgress, setResult]);
}
