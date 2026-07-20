import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  PageAccessMessage,
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { PageAccessOperation as PageAccessOperationValue } from '@sniptale/runtime-contracts/messaging/page-access';
import { translate } from '../../../platform/i18n';
import {
  createRuntimeMessagingTransport,
  getErrorMessage,
} from '../../../platform/runtime-messaging';
import {
  resolveBackgroundOperationAfterUiGrant,
  rollbackOriginGrant,
  type UiGrantResolution,
} from './page-access-grants';

type RuntimeTransport = ReturnType<typeof createRuntimeMessagingTransport>;
type PageAccessStatusSetter = (status: PageAccessStatus | null) => void;
type PageAccessErrorSetter = (error: string | null) => void;
type PageAccessLoadingSetter = (loading: boolean) => void;

export interface PopupPageAccessRuntime {
  disabledReason: string | null;
  error: string | null;
  handleRequest(operation: PageAccessOperation): Promise<void>;
  loading: boolean;
  pendingOperation: PageAccessOperation | null;
  status: PageAccessStatus | null;
}

function shouldLoadPageAccessStatus(activeTabCapabilities: ActiveTabCapabilities): boolean {
  return activeTabCapabilities.tabId !== null && !activeTabCapabilities.isRestrictedPage;
}

function createPageAccessMessage(
  operation: PageAccessOperation,
  tabId: number | null
): PageAccessMessage {
  return tabId === null
    ? {
        operation,
        type: MessageType.PAGE_ACCESS,
      }
    : {
        operation,
        tabId,
        type: MessageType.PAGE_ACCESS,
      };
}

function getPageAccessDisabledReason(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccessLoading: boolean;
  pageAccessStatus: PageAccessStatus | null;
}): string | null {
  if (!shouldLoadPageAccessStatus(args.activeTabCapabilities)) {
    return null;
  }

  if (args.pageAccessLoading && !args.pageAccessStatus) {
    return translate('popup.home.pageAccessChecking');
  }

  if (args.pageAccessStatus?.supported === true && !args.pageAccessStatus.currentTabActive) {
    return translate('popup.home.pageAccessRequired');
  }

  return null;
}

interface PageAccessStatusLoadEffectArgs {
  runtimeTransport: RuntimeTransport;
  setError: PageAccessErrorSetter;
  setLoading: PageAccessLoadingSetter;
  setStatus: PageAccessStatusSetter;
  tabId: number | null;
}

function startPageAccessStatusLoad(args: PageAccessStatusLoadEffectArgs): () => void {
  let disposed = false;
  args.setLoading(true);
  void args.runtimeTransport
    .sendRuntimeMessage(createPageAccessMessage(PageAccessOperationValue.READ_STATUS, args.tabId))
    .then((response) => {
      if (disposed) {
        return;
      }
      args.setStatus(response.status ?? null);
      args.setError(response.success === false ? (response.error ?? null) : null);
    })
    .catch((error: unknown) => {
      if (!disposed) {
        args.setError(getErrorMessage(error, translate('popup.home.pageAccessFailed')));
      }
    })
    .finally(() => {
      if (!disposed) {
        args.setLoading(false);
      }
    });

  return () => {
    disposed = true;
  };
}

function resetPageAccessStatus(args: {
  setError: PageAccessErrorSetter;
  setLoading: PageAccessLoadingSetter;
  setStatus: PageAccessStatusSetter;
}): void {
  args.setStatus(null);
  args.setError(null);
  args.setLoading(false);
}

function usePageAccessStatusLoader(args: {
  tabId: number | null;
  runtimeTransport: RuntimeTransport;
  setError: PageAccessErrorSetter;
  setLoading: PageAccessLoadingSetter;
  setStatus: PageAccessStatusSetter;
  shouldLoadPageAccess: boolean;
}): void {
  const { runtimeTransport, setError, setLoading, setStatus, shouldLoadPageAccess, tabId } = args;

  useEffect(() => {
    if (!shouldLoadPageAccess) {
      resetPageAccessStatus({ setError, setLoading, setStatus });
      return;
    }

    setStatus(null);
    return startPageAccessStatusLoad({ runtimeTransport, setError, setLoading, setStatus, tabId });
  }, [runtimeTransport, setError, setLoading, setStatus, shouldLoadPageAccess, tabId]);
}

function usePageAccessRequest(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  runtimeTransport: RuntimeTransport;
  setError(error: string | null): void;
  setPendingOperation(operation: PageAccessOperation | null): void;
  setStatus(status: PageAccessStatus | null): void;
  shouldLoadPageAccess: boolean;
  status: PageAccessStatus | null;
}): (operation: PageAccessOperation) => Promise<void> {
  return useCallback(
    async (operation) => {
      if (!args.shouldLoadPageAccess) {
        return;
      }

      args.setPendingOperation(operation);
      args.setError(null);
      let grantResolution: UiGrantResolution | null = null;
      try {
        grantResolution = await resolveBackgroundOperationAfterUiGrant({
          activeTabId: args.activeTabCapabilities.tabId,
          operation,
          status: args.status,
        });
        if (!grantResolution) {
          args.setError(translate('popup.home.pageAccessFailed'));
          return;
        }

        const response = await args.runtimeTransport.sendRuntimeMessage(
          createPageAccessMessage(grantResolution.operation, args.activeTabCapabilities.tabId)
        );
        args.setStatus(response.status ?? null);
        if (response.success === false) {
          await rollbackOriginGrant(grantResolution.rollbackOrigins);
          args.setError(response.error ?? translate('popup.home.pageAccessFailed'));
        }
      } catch (error) {
        if (grantResolution) {
          await rollbackOriginGrant(grantResolution.rollbackOrigins);
        }
        args.setError(getErrorMessage(error, translate('popup.home.pageAccessFailed')));
      } finally {
        args.setPendingOperation(null);
      }
    },
    [args]
  );
}

export function usePopupPageAccessRuntime(
  activeTabCapabilities: ActiveTabCapabilities
): PopupPageAccessRuntime {
  const runtimeTransport = useMemo(() => createRuntimeMessagingTransport(), []);
  const [status, setStatus] = useState<PageAccessStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PageAccessOperation | null>(null);
  const shouldLoadPageAccess = shouldLoadPageAccessStatus(activeTabCapabilities);

  usePageAccessStatusLoader({
    runtimeTransport,
    setError,
    setLoading,
    setStatus,
    shouldLoadPageAccess,
    tabId: activeTabCapabilities.tabId,
  });
  const handleRequest = usePageAccessRequest({
    activeTabCapabilities,
    runtimeTransport,
    setError,
    setPendingOperation,
    setStatus,
    shouldLoadPageAccess,
    status,
  });

  return {
    disabledReason: getPageAccessDisabledReason({
      activeTabCapabilities,
      pageAccessLoading: loading,
      pageAccessStatus: status,
    }),
    error,
    handleRequest,
    loading,
    pendingOperation,
    status,
  };
}
