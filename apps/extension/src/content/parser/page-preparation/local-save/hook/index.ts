import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { translate } from '../../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  isWritableLocalHtmlPage,
  PagePreparationLocalSaveResultKind,
  savePreparedLocalHtml,
  type SavePreparedLocalHtmlResult,
  type WritableLocalHtmlFileHandle,
} from '..';
import { pagePreparationHistory } from '../../history';

export const PagePreparationLocalSaveStatus = {
  Error: 'error',
  Idle: 'idle',
  Saved: 'saved',
  Saving: 'saving',
  Warning: 'warning',
} as const;

export type PagePreparationLocalSaveStatus =
  (typeof PagePreparationLocalSaveStatus)[keyof typeof PagePreparationLocalSaveStatus];

export interface PagePreparationLocalSaveViewState {
  disabled: boolean;
  onSave: () => Promise<void>;
  status: PagePreparationLocalSaveStatus;
  title: string;
  visible: boolean;
}

interface HistoryGuardState {
  hasOpenTransactions: boolean;
  isApplying: boolean;
}

function readHistoryGuardState(): HistoryGuardState {
  return {
    hasOpenTransactions: pagePreparationHistory.hasOpenTransactions(),
    isApplying: pagePreparationHistory.isApplying(),
  };
}

function getBlockedHistoryMessage(historyGuard: HistoryGuardState): string | null {
  if (historyGuard.hasOpenTransactions) {
    return translate('content.toolbar.localHtmlSaveBlockedHistory');
  }

  if (historyGuard.isApplying) {
    return translate('content.toolbar.localHtmlSaveBlockedHistory');
  }

  return null;
}

function getSaveErrorMessage(result: SavePreparedLocalHtmlResult): string {
  if (result.kind === PagePreparationLocalSaveResultKind.PermissionDenied) {
    return translate('content.toolbar.localHtmlSavePermissionDenied');
  }

  if (result.kind === PagePreparationLocalSaveResultKind.Unsupported) {
    return translate('content.toolbar.localHtmlSaveUnsupported');
  }

  if (result.kind === PagePreparationLocalSaveResultKind.Error && result.message) {
    return `${translate('content.toolbar.localHtmlSaveError')} ${result.message}`;
  }

  return translate('content.toolbar.localHtmlSaveError');
}

function getSaveStatusTitle(status: PagePreparationLocalSaveStatus): string {
  const titles: Record<PagePreparationLocalSaveStatus, string> = {
    error: translate('content.toolbar.localHtmlSaveError'),
    idle: translate('content.toolbar.localHtmlSaveLabel'),
    saved: translate('content.toolbar.localHtmlSaveSaved'),
    saving: translate('content.toolbar.localHtmlSaveSaving'),
    warning: translate('content.toolbar.localHtmlSaveSavedWithWarnings'),
  };

  return titles[status];
}

function showSavedToast(result: SavePreparedLocalHtmlResult): PagePreparationLocalSaveStatus {
  if (result.kind !== PagePreparationLocalSaveResultKind.Saved) {
    return PagePreparationLocalSaveStatus.Error;
  }

  if (result.warnings.length > 0) {
    showToast(translate('content.toolbar.localHtmlSaveSavedWithWarnings'), 'warning', 5000);
    return PagePreparationLocalSaveStatus.Warning;
  }

  showToast(translate('content.toolbar.localHtmlSaveSaved'), 'success');
  return PagePreparationLocalSaveStatus.Saved;
}

function createUnexpectedSaveError(error: unknown): SavePreparedLocalHtmlResult {
  const message = error instanceof Error ? error.message : undefined;
  return {
    kind: PagePreparationLocalSaveResultKind.Error,
    ...(message === undefined ? {} : { message }),
  };
}

function useHistoryGuardState(): HistoryGuardState {
  const [historyGuard, setHistoryGuard] = useState(readHistoryGuardState);

  useEffect(() => {
    return pagePreparationHistory.subscribe(() => {
      setHistoryGuard(readHistoryGuardState());
    });
  }, []);

  return historyGuard;
}

function useMountedRef() {
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return mountedRef;
}

function applySaveResult(args: {
  result: SavePreparedLocalHtmlResult;
  setFileHandle: (handle: WritableLocalHtmlFileHandle | null) => void;
  setStatus: (status: PagePreparationLocalSaveStatus) => void;
}) {
  if (args.result.kind === PagePreparationLocalSaveResultKind.Cancelled) {
    args.setStatus(PagePreparationLocalSaveStatus.Idle);
    return;
  }

  if (args.result.kind === PagePreparationLocalSaveResultKind.Saved) {
    args.setFileHandle(args.result.fileHandle);
    args.setStatus(showSavedToast(args.result));
    return;
  }

  if (args.result.kind === PagePreparationLocalSaveResultKind.PermissionDenied) {
    args.setFileHandle(null);
  }

  args.setStatus(PagePreparationLocalSaveStatus.Error);
  showToast(getSaveErrorMessage(args.result), 'error', 5000);
}

function useLocalSaveAction(args: {
  fileHandle: WritableLocalHtmlFileHandle | null;
  mountedRef: RefObject<boolean>;
  setFileHandle: (handle: WritableLocalHtmlFileHandle | null) => void;
  setStatus: (status: PagePreparationLocalSaveStatus) => void;
}) {
  const { fileHandle, mountedRef, setFileHandle, setStatus } = args;
  const inFlightRef = useRef(false);
  const sequenceRef = useRef(0);

  return useCallback(async () => {
    const historyMessage = getBlockedHistoryMessage(readHistoryGuardState());
    if (historyMessage) {
      showToast(historyMessage, 'warning', 4000);
      return;
    }

    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    setStatus(PagePreparationLocalSaveStatus.Saving);
    let result: SavePreparedLocalHtmlResult;

    try {
      result = await savePreparedLocalHtml({ fileHandle });
    } catch (error) {
      result = createUnexpectedSaveError(error);
    } finally {
      inFlightRef.current = false;
    }

    if (!mountedRef.current || sequence !== sequenceRef.current) {
      return;
    }

    applySaveResult({
      result,
      setFileHandle,
      setStatus,
    });
  }, [fileHandle, mountedRef, setFileHandle, setStatus]);
}

export function usePagePreparationLocalSave(): PagePreparationLocalSaveViewState {
  const [fileHandle, setFileHandle] = useState<WritableLocalHtmlFileHandle | null>(null);
  const [status, setStatus] = useState<PagePreparationLocalSaveStatus>(
    PagePreparationLocalSaveStatus.Idle
  );
  const historyGuard = useHistoryGuardState();
  const mountedRef = useMountedRef();
  const visible = isWritableLocalHtmlPage();
  const blockedHistoryMessage = getBlockedHistoryMessage(historyGuard);
  const disabled =
    status === PagePreparationLocalSaveStatus.Saving || blockedHistoryMessage !== null;
  const onSave = useLocalSaveAction({ fileHandle, mountedRef, setFileHandle, setStatus });

  const title = useMemo(() => {
    return blockedHistoryMessage ?? getSaveStatusTitle(status);
  }, [blockedHistoryMessage, status]);

  return {
    disabled,
    onSave,
    status,
    title,
    visible,
  };
}
