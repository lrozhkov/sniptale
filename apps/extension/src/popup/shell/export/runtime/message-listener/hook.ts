import { useEffect } from 'react';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { applyPopupExportRuntimeMessage } from './apply';
import { parsePopupExportRuntimeMessage } from './parse';
import type { PopupExportRuntimeContract } from '../types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportJobStatus } from '@sniptale/runtime-contracts/export';
import { getDefaultPopupExportRuntimeDeps } from '../default-deps';

export function usePopupExportMessageListener(state: PopupExportRuntimeContract) {
  const { cancelRetryRef, requestIdRef, setProgress, setResult } = state;

  useEffect(() => {
    let latestStatus: { jobId: string; revision: number } | null = null;
    const applyJobStatus = (status: PopupExportJobStatus) => {
      const applied = applyPopupExportRuntimeMessage({
        message: { type: MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED, status },
        requestId: requestIdRef.current,
        setProgress,
        setResult,
        latestStatus,
        setLatestStatus: (nextStatus) => {
          latestStatus = nextStatus;
        },
        setRequestId: (requestId) => {
          requestIdRef.current = requestId;
        },
        clearRequestId: () => {
          cancelRetryRef.current = null;
          requestIdRef.current = null;
        },
      });
      if (applied && (status.phase === 'running' || status.phase === 'cancelling')) {
        cancelRetryRef.current = {
          exportRunId: status.jobId,
          tabIds: status.orderedTabs.map((tab) => tab.tabId),
        };
      }
    };

    const handleMessage = (message: unknown) => {
      const typedMessage = parsePopupExportRuntimeMessage(message);
      if (!typedMessage) {
        return;
      }

      applyJobStatus(typedMessage.status);
    };

    const unsubscribe = browserRuntime.subscribeToMessages(handleMessage);
    const getJobStatus = getDefaultPopupExportRuntimeDeps().sendGetJobStatusMessage;
    if (getJobStatus) {
      void getJobStatus({ type: MessageType.GET_POPUP_EXPORT_JOB_STATUS })
        .then((response) => {
          if (response?.success && response.status) applyJobStatus(response.status);
        })
        .catch(() => undefined);
    }
    return unsubscribe;
  }, [cancelRetryRef, requestIdRef, setProgress, setResult]);
}
