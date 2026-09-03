import { useEffect } from 'react';

import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { applyPopupExportRuntimeMessage } from './apply';
import { parsePopupExportRuntimeMessage } from './parse';
import type { PopupExportRuntimeContract } from '../types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PagePackageJobStatusV1 } from '@sniptale/runtime-contracts/page-package';
import { getDefaultPopupExportRuntimeDeps } from '../default-deps';

export function usePopupExportMessageListener(state: PopupExportRuntimeContract) {
  const {
    cancelRetryRef,
    requestIdRef,
    setLaunchedPlan,
    setProgress,
    setResult,
    terminalRequestIdRef,
  } = state;

  useEffect(() => {
    let latestStatus: { jobId: string; revision: number } | null = null;
    const applyMessage = (
      message: Parameters<typeof applyPopupExportRuntimeMessage>[0]['message']
    ) =>
      applyPopupExportRuntimeMessage({
        message,
        requestId: requestIdRef.current,
        setLaunchedPlan,
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
          terminalRequestIdRef.current = requestIdRef.current;
          cancelRetryRef.current = null;
          requestIdRef.current = null;
        },
      });
    const applyJobStatus = (status: PagePackageJobStatusV1, locale?: 'en' | 'ru' | null) => {
      if (terminalRequestIdRef.current === status.jobId) return;
      const applied = applyMessage({
        type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
        status,
      });
      if (applied && (status.phase === 'running' || status.phase === 'cancelling')) {
        const currentCancellation = cancelRetryRef.current;
        const retainedLocale =
          locale ??
          (currentCancellation?.exportRunId === status.jobId
            ? currentCancellation.locale
            : undefined);
        cancelRetryRef.current = {
          exportRunId: status.jobId,
          ...(retainedLocale ? { locale: retainedLocale } : {}),
          owner: 'job',
          tabIds: status.orderedTabs.map((tab) => tab.tabId),
        };
      }
    };

    const handleMessage = (message: unknown) => {
      const typedMessage = parsePopupExportRuntimeMessage(message);
      if (!typedMessage) {
        return;
      }

      applyJobStatus(typedMessage.status, typedMessage.locale);
    };

    const unsubscribe = browserRuntime.subscribeToMessages(handleMessage);
    const getJobStatus = getDefaultPopupExportRuntimeDeps().sendGetJobStatusMessage;
    if (getJobStatus) {
      void getJobStatus({ type: MessageType.GET_PAGE_PACKAGE_JOB_STATUS })
        .then((response) => {
          if (response?.success && response.status) {
            applyJobStatus(response.status, response.locale);
          }
        })
        .catch(() => undefined);
    }
    return unsubscribe;
  }, [cancelRetryRef, requestIdRef, setLaunchedPlan, setProgress, setResult, terminalRequestIdRef]);
}
