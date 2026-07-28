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
import { ensureActivePageAccessRuntime } from '../../page-access/service';
import { respondAsyncRouteWithLogger } from '../../../routing-contracts/response';
import type { PopupExportViewerMessage } from '../message-guards/guards/shared';
import * as contentActionRoute from '../../../routing-contracts/capabilities/content-action/route';
import type { TabRouteArgs } from './shared';
import { executeInjectedWebSnapshotContentExport } from './popup-export-injected-runner';
import type { FullPageExportCaptureAction } from '../../../../contracts/full-page-capture';
import { cancelFullPageCaptureByExportRunId } from '../../../capture/full-page/cancellation';

type PopupExportRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: PopupExportViewerMessage;
};
type ViewerPortPopupExportMessage = ViewerContracts.ViewerPopupExportMessage;
type NonSavePopupExportMessage = Exclude<
  PopupExportViewerMessage,
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
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
  message: PopupExportViewerMessage
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

function resolveFullPageCaptureAction(
  message: NonSavePopupExportMessage,
  target: PopupExportTarget
): FullPageExportCaptureAction {
  return message.type === MessageType.EXPORT_POPUP_BUILD_PACKAGE || target.tab.active !== true
    ? MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED
    : MessageType.EXPORT_CAPTURE_FULL_PAGE;
}

function shouldGrantFullPageExportIntent(message: NonSavePopupExportMessage): boolean {
  return (
    (message.type === MessageType.EXPORT_POPUP_START ||
      message.type === MessageType.EXPORT_POPUP_BUILD_PACKAGE) &&
    message.options.includeFullPageScreenshot
  );
}

function createContentPopupExportMessage(
  message: NonSavePopupExportMessage,
  resolvedTabId: number,
  target: PopupExportTarget
): Exclude<
  ViewerPortPopupExportMessage,
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
> {
  switch (message.type) {
    case MessageType.EXPORT_POPUP_PREVIEW:
      return { type: message.type };
    case MessageType.EXPORT_POPUP_START:
      const startAction = resolveFullPageCaptureAction(message, target);
      return {
        ...(shouldGrantFullPageExportIntent(message)
          ? {
              contentIntentGrant: issueFullPageExportContentIntentGrant(resolvedTabId, startAction),
              fullPageCaptureAction: startAction,
            }
          : {}),
        options: message.options,
        requestId: message.requestId,
        type: message.type,
      };
    case MessageType.EXPORT_POPUP_BUILD_PACKAGE:
      const packageAction = resolveFullPageCaptureAction(message, target);
      return {
        ...(shouldGrantFullPageExportIntent(message)
          ? {
              contentIntentGrant: issueFullPageExportContentIntentGrant(
                resolvedTabId,
                packageAction
              ),
              fullPageCaptureAction: packageAction,
            }
          : {}),
        batchRequestId: message.batchRequestId,
        options: message.options,
        type: message.type,
      };
    case MessageType.EXPORT_POPUP_CANCEL:
      return { type: message.type, exportRunId: message.exportRunId };
  }
}

function toWebSnapshotRouteResponse(response: unknown): WebSnapshotRouteResponse {
  return typeof response === 'object' && response !== null ? response : {};
}

function sendPopupExportToViewer(args: PopupExportRouteArgs): Promise<unknown> {
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

function sendPopupExportToContent(
  args: NonSavePopupExportRouteArgs,
  target: PopupExportTarget
): Promise<unknown> {
  return sendTabMessage(
    args.resolvedTabId,
    createContentPopupExportMessage(args.message, args.resolvedTabId, target)
  );
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
          args.target.tab.active === true
            ? MessageType.EXPORT_CAPTURE_FULL_PAGE
            : MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED
        ),
        fullPageCaptureAction:
          args.target.tab.active === true
            ? MessageType.EXPORT_CAPTURE_FULL_PAGE
            : MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED,
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
        : await sendPopupExportToContent(cancelArgs, target);
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
    : sendPopupExportToContent(nonSaveArgs, target);
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
