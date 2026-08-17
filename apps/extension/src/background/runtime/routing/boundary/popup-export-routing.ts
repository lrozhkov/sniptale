import { browserTabs } from '@sniptale/platform/browser/tabs';
import type * as ViewerContracts from '../../../../workflows/page-preparation/contracts';
import { sendTabMessage } from '../../../../platform/runtime-messaging';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { loadSettings } from '../../../../composition/persistence/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  authorizeWebSnapshotCaptureRequest,
  cancelWebSnapshotCaptureRequest,
} from '../../../capture/routes';
import { deleteMediaLibraryAssetsBatchSafely } from '../../../../workflows/media-hub/store';
import {
  createWebSnapshotViewerPorts,
  sendViewerPopupExportMessage,
} from '../../../capture/lifecycle';
import { ensureActivePageAccessRuntime } from '../../../page-access/service';
import { respondAsyncRouteWithLogger } from '../../../routing-contracts/response';
import type { PopupExportViewerMessage } from '../message-guards/guards/shared';
import * as contentActionRoute from '../../../routing-contracts/capabilities/content-action/route';
import type { TabRouteArgs } from './shared';
import { executeInjectedWebSnapshotContentExport } from './popup-export-injected-runner';
import type { FullPageExportCaptureAction } from '../../../../contracts/full-page-capture';
import { cancelFullPageCaptureByExportRunId } from '../../../capture/full-page/cancellation';
import { consumePopupExportLaunchIntent } from '../../../capture/annotation-export/popup-launch-intent';
import { assertPopupTabRouteTargetDocument } from '../capabilities/popup-tab/route-capabilities';

type PopupExportRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: PopupExportViewerMessage;
};
type ViewerPortPopupExportMessage = ViewerContracts.ViewerPopupExportMessage;
type ForwardedPopupExportMessage = Exclude<
  PopupExportViewerMessage,
  { type: typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT }
>;
type ForwardedPopupExportRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: ForwardedPopupExportMessage;
};
type NonSavePopupExportMessage = Exclude<
  PopupExportViewerMessage,
  | { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
  | { type: typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT }
>;
type NonSavePopupExportRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: NonSavePopupExportMessage;
};
type WebSnapshotSaveRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: Extract<
    PopupExportViewerMessage,
    { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
  >;
};
type WebSnapshotRouteResponse = {
  error?: string;
  success?: boolean;
};
type PopupExportTarget = {
  isOwnedSnapshotViewer: boolean;
  tab: chrome.tabs.Tab;
};

function createWebSnapshotRouteError(stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${stage}: ${message}`);
}

async function runWebSnapshotRouteStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw createWebSnapshotRouteError(stage, error);
  }
}

function createViewerPopupExportMessage(
  message: ForwardedPopupExportMessage
): ViewerPortPopupExportMessage {
  const {
    tabId: _tabId,
    tabRouteCapabilityToken: _tabRouteCapabilityToken,
    tabRouteRequestId: _tabRouteRequestId,
    ...viewerMessage
  } = message;
  return viewerMessage;
}

function issueFullPageExportContentIntentGrant(tabId: number, action: FullPageExportCaptureAction) {
  return contentActionRoute.issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [action],
    tabId,
  });
}

function createContentPopupExportMessage(
  message: NonSavePopupExportMessage
): Exclude<
  ViewerPortPopupExportMessage,
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
> {
  switch (message.type) {
    case MessageType.EXPORT_POPUP_PREVIEW:
      return { type: message.type };
    case MessageType.EXPORT_POPUP_BUILD_PACKAGE: {
      return {
        batchRequestId: message.batchRequestId,
        options: message.options,
        type: message.type,
      };
    }
    case MessageType.EXPORT_POPUP_CANCEL:
      return { type: message.type, exportRunId: message.exportRunId };
  }
  throw new Error('Unsupported popup export message');
}

function toWebSnapshotRouteResponse(response: unknown): WebSnapshotRouteResponse {
  return typeof response === 'object' && response !== null ? response : {};
}

function sendPopupExportToViewer(args: ForwardedPopupExportRouteArgs): Promise<unknown> {
  return sendViewerPopupExportMessage(
    args.deps.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
    args.resolvedTabId,
    createViewerPopupExportMessage(args.message)
  );
}

async function resolvePopupExportTarget(resolvedTabId: number): Promise<PopupExportTarget> {
  const tab = await runWebSnapshotRouteStage('resolve popup export target tab', () =>
    browserTabs.get(resolvedTabId)
  );
  if (isOwnedSnapshotViewerPage(tab.url)) {
    return { isOwnedSnapshotViewer: true, tab };
  }

  await ensureActivePageAccessRuntime(resolvedTabId, 'Page access is required for export.');

  return { isOwnedSnapshotViewer: false, tab };
}

function sendPopupExportToContent(args: NonSavePopupExportRouteArgs): Promise<unknown> {
  return sendTabMessage(args.resolvedTabId, createContentPopupExportMessage(args.message));
}

async function routeWebSnapshotSave(
  args: WebSnapshotSaveRouteArgs & {
    target: PopupExportTarget;
  }
): Promise<unknown> {
  if (args.target.isOwnedSnapshotViewer) {
    return runWebSnapshotRouteStage('route web snapshot viewer export', () =>
      sendPopupExportToViewer(args)
    );
  }

  const settings = await runWebSnapshotRouteStage('load web snapshot settings', () =>
    loadSettings()
  );
  authorizeWebSnapshotCaptureRequest(args.resolvedTabId, args.message.requestId, {
    allowAnonymousCrossOriginAssets: settings.anonymousCrossOriginSnapshotAssetsEnabled,
  });
  const response = toWebSnapshotRouteResponse(
    await runWebSnapshotRouteStage('execute injected web snapshot content export', () =>
      executeInjectedWebSnapshotContentExport({
        allowAnonymousCrossOriginAssets: settings.anonymousCrossOriginSnapshotAssetsEnabled,
        allowAuthenticatedSameOriginAssets: settings.authenticatedSnapshotAssetsEnabled,
        contentIntentGrant: issueFullPageExportContentIntentGrant(
          args.resolvedTabId,
          MessageType.EXPORT_CAPTURE_FULL_PAGE
        ),
        fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        requestId: args.message.requestId,
        resolvedTabId: args.resolvedTabId,
      })
    )
  );

  if (!response?.success) {
    throw createWebSnapshotRouteError(
      'route web snapshot content export',
      response?.error || 'Web snapshot content export failed'
    );
  }

  return response;
}

async function routePopupExportMessageWork(args: PopupExportRouteArgs): Promise<unknown> {
  await assertPopupTabRouteTargetDocument({
    tabId: args.resolvedTabId,
    token: args.message.tabRouteCapabilityToken,
  });
  if (args.message.type === MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT) {
    return {
      page: consumePopupExportLaunchIntent(args.resolvedTabId) ? ('export' as const) : null,
      success: true,
    };
  }
  if (args.message.type === MessageType.EXPORT_POPUP_CANCEL) {
    cancelFullPageCaptureByExportRunId(args.message.exportRunId);
    const committedAssetIds = cancelWebSnapshotCaptureRequest(
      args.resolvedTabId,
      args.message.exportRunId
    );
    let compensationFailure: unknown;
    try {
      if (committedAssetIds.length > 0) {
        await deleteMediaLibraryAssetsBatchSafely(committedAssetIds);
      }
    } catch (error) {
      compensationFailure = error;
    }

    let forwardingResult: unknown;
    let forwardingFailure: unknown;
    try {
      const target = await resolvePopupExportTarget(args.resolvedTabId);
      const cancelArgs: NonSavePopupExportRouteArgs = { ...args, message: args.message };
      forwardingResult = target.isOwnedSnapshotViewer
        ? await sendPopupExportToViewer(cancelArgs)
        : await sendPopupExportToContent(cancelArgs);
    } catch (error) {
      forwardingFailure = error;
    }

    if (compensationFailure && forwardingFailure) {
      throw new AggregateError(
        [compensationFailure, forwardingFailure],
        'Popup export cancellation cleanup and forwarding failed'
      );
    }
    if (compensationFailure) throw compensationFailure;
    if (forwardingFailure) throw forwardingFailure;
    return forwardingResult;
  }
  const target = await resolvePopupExportTarget(args.resolvedTabId);
  if (args.message.type === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT) {
    return routeWebSnapshotSave({ ...args, message: args.message, target });
  }

  const nonSaveArgs: NonSavePopupExportRouteArgs = { ...args, message: args.message };
  return target.isOwnedSnapshotViewer
    ? sendPopupExportToViewer(nonSaveArgs)
    : sendPopupExportToContent(nonSaveArgs);
}

export function routePopupExportMessage(args: PopupExportRouteArgs): void {
  respondAsyncRouteWithLogger({
    failureLogMessage: 'Web snapshot viewer export request failed',
    fallbackMessage: 'Web snapshot viewer export failed',
    logger: { error: () => undefined },
    sendResponse: args.sendResponse,
    work: routePopupExportMessageWork(args),
  });
}

export async function requestPopupExportPagePackage(args: {
  batchRequestId: string;
  options: import('@sniptale/runtime-contracts/export').ExportOptions;
  tabId: number;
}): Promise<unknown> {
  const target = await resolvePopupExportTarget(args.tabId);
  const message = {
    batchRequestId: args.batchRequestId,
    options: args.options,
    type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  } as const;
  return target.isOwnedSnapshotViewer
    ? sendViewerPopupExportMessage(createWebSnapshotViewerPorts(), args.tabId, message)
    : sendTabMessage(args.tabId, message);
}

export async function cancelPopupExportPagePackage(args: {
  exportRunId: string;
  tabId: number;
}): Promise<void> {
  const target = await resolvePopupExportTarget(args.tabId);
  const message = {
    exportRunId: args.exportRunId,
    type: MessageType.EXPORT_POPUP_CANCEL,
  } as const;
  if (target.isOwnedSnapshotViewer) {
    await sendViewerPopupExportMessage(createWebSnapshotViewerPorts(), args.tabId, message);
    return;
  }
  await sendTabMessage(args.tabId, message);
}
