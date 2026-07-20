import { translate } from '../../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupExportSelection } from '../../session/selectors';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportBatchPackage, PopupExportRuntimeDeps } from '../types';
import {
  logPopupExportBatchStale,
  logPopupExportBatchTabRequest,
  logPopupExportBatchTabResult,
  logPopupExportBatchUnexpectedFailure,
} from '../logging';
import { buildPopupExportOptions } from '../options';
import { getPopupExportTransportErrorMessage } from '../preview-request';
import { parsePopupBatchPagePackageAtBoundary } from './batch-package-boundary';
import { isCurrentBatchRequest, setBatchExportProgress } from './batch-state';

function prefixTabErrors(tabTitle: string, errors: string[]): string[] {
  return errors.map((error) => `${tabTitle}: ${error}`);
}

async function requestBatchPagePackage(args: {
  deps: PopupExportRuntimeDeps;
  index: number;
  requestId: string;
  state: PopupExportRuntimeContract;
  tab: PopupExportRuntimeContract['availableTabs'][number];
  total: number;
}) {
  if (args.tab.tabId === null || !isCurrentBatchRequest(args.state, args.requestId)) {
    return null;
  }

  logPopupExportBatchTabRequest({
    index: args.index,
    requestId: args.requestId,
    tabId: args.tab.tabId,
    total: args.total,
  });

  const response = await args.deps.sendBuildPackageMessage(args.tab.tabId, {
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
    options: buildPopupExportOptions(getPopupExportSelection(args.state)),
  });

  if (!isCurrentBatchRequest(args.state, args.requestId)) {
    logPopupExportBatchStale({
      phase: 'request',
      requestId: args.requestId,
    });
    return null;
  }

  logPopupExportBatchTabResult({
    hasPagePackage: Boolean(response.pagePackage),
    index: args.index,
    requestId: args.requestId,
    success: response.success,
    tabId: args.tab.tabId,
    total: args.total,
    ...(response.error === undefined ? {} : { error: response.error }),
  });
  return response;
}

function createBatchCollectionError(tabTitle: string, error: unknown): string {
  const message = getPopupExportTransportErrorMessage(error, 'popup.export.startExportError');
  return `${tabTitle}: ${message}`;
}

function handleBatchPackageResponse(args: {
  errors: string[];
  pagePackages: PopupExportBatchPackage[];
  response: Awaited<ReturnType<typeof requestBatchPagePackage>>;
  tab: PopupExportRuntimeContract['availableTabs'][number];
}) {
  if (!args.response) {
    return false;
  }

  if (!args.response.success || !args.response.pagePackage) {
    args.errors.push(createBatchCollectionError(args.tab.title, args.response.error));
    return true;
  }

  const pagePackage = parsePopupBatchPagePackageAtBoundary(args.response.pagePackage);
  args.pagePackages.push({
    pagePackage,
    tabId: args.tab.tabId as number,
    tabTitle: args.tab.title,
  });
  args.errors.push(...prefixTabErrors(args.tab.title, pagePackage.errors));
  return true;
}

function handleBatchPackageFailure(args: {
  error: unknown;
  errors: string[];
  index: number;
  requestId: string;
  tab: PopupExportRuntimeContract['availableTabs'][number];
  total: number;
}) {
  logPopupExportBatchUnexpectedFailure({
    error: args.error,
    index: args.index,
    requestId: args.requestId,
    tabId: args.tab.tabId as number,
    total: args.total,
  });
  args.errors.push(createBatchCollectionError(args.tab.title, args.error));
}

export async function collectBatchPagePackages(args: {
  deps: PopupExportRuntimeDeps;
  requestId: string;
  selectedTabs: PopupExportRuntimeContract['availableTabs'];
  state: PopupExportRuntimeContract;
}) {
  const pagePackages: PopupExportBatchPackage[] = [];
  const errors: string[] = [];
  const total = args.selectedTabs.length;
  for (let index = 0; index < total; index += 1) {
    const tab = args.selectedTabs[index];
    if (!tab || !isCurrentBatchRequest(args.state, args.requestId)) {
      return null;
    }

    setBatchExportProgress(
      args.state,
      index,
      total,
      `${translate('popup.export.batchCollectingMessage')} ${tab.title}`,
      'downloading'
    );

    try {
      const response = await requestBatchPagePackage({
        deps: args.deps,
        index: index + 1,
        requestId: args.requestId,
        state: args.state,
        tab,
        total,
      });

      if (!handleBatchPackageResponse({ errors, pagePackages, response, tab })) {
        return null;
      }
    } catch (error) {
      handleBatchPackageFailure({
        error,
        errors,
        index: index + 1,
        requestId: args.requestId,
        tab,
        total,
      });
    }
  }
  return { errors, pagePackages };
}
