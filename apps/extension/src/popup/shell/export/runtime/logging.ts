import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'PopupExportRuntime' });

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function logPopupExportCopyFailure(error: unknown) {
  logger.error('Failed to copy export preview', error);
}

export function logPopupExportCancelFailure(error: unknown) {
  logger.error('Failed to cancel export', error);
}

export function logPopupExportBatchStart(details: { requestId: string; selectedCount: number }) {
  logger.debug('Popup batch export started', details);
}

export function logPopupExportBatchTabRequest(details: {
  index: number;
  requestId: string;
  tabId: number;
  total: number;
}) {
  logger.debug('Popup batch export requested tab package', details);
}

export function logPopupExportBatchTabResult(details: {
  error?: string;
  hasPagePackage: boolean;
  index: number;
  requestId: string;
  success: boolean;
  tabId: number;
  total: number;
}) {
  logger.debug('Popup batch export tab package result', details);
}

export function logPopupExportBatchArchiveSaveStart(details: {
  pageCount: number;
  requestId: string;
}) {
  logger.debug('Popup batch export archive save started', details);
}

export function logPopupExportBatchArchiveSaveSuccess(details: {
  pageCount: number;
  requestId: string;
}) {
  logger.debug('Popup batch export archive save succeeded', details);
}

export function logPopupExportBatchArchiveSaveFailure(details: {
  error?: string;
  pageCount: number;
  requestId: string;
}) {
  logger.debug('Popup batch export archive save failed', details);
}

export function logPopupExportBatchEmptyResult(details: {
  errorCount: number;
  requestId: string;
  selectedCount: number;
}) {
  logger.debug('Popup batch export finished without page packages', details);
}

export function logPopupExportBatchStale(details: {
  phase: 'collect' | 'finish' | 'request';
  requestId: string;
}) {
  logger.debug('Popup batch export ignored stale request', details);
}

export function logPopupExportBatchUnexpectedFailure(details: {
  error: unknown;
  index: number;
  requestId: string;
  tabId: number;
  total: number;
}) {
  logger.debug('Popup batch export tab package failed unexpectedly', {
    error: getErrorMessage(details.error),
    index: details.index,
    requestId: details.requestId,
    tabId: details.tabId,
    total: details.total,
  });
}
