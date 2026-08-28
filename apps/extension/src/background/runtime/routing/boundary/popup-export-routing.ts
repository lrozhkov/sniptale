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
import type { FullPageExportCaptureAction } from '../../../../contracts/full-page-capture';
import { cancelFullPageCaptureByExportRunId } from '../../../capture/full-page/cancellation';
import { consumePopupExportLaunchIntent } from '../../../capture/annotation-export/popup-launch-intent';
import { assertPopupTabRouteTargetDocument } from '../capabilities/popup-tab/route-capabilities';
import { isPopupExportPackageResponse } from '../../../../contracts/messaging/validators/export';

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
  { type: typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT }
>;
type NonSavePopupExportRouteArgs = Omit<TabRouteArgs, 'message'> & {
  message: NonSavePopupExportMessage;
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
): ViewerPortPopupExportMessage {
  switch (message.type) {
    case MessageType.EXPORT_POPUP_PREVIEW:
      return { type: message.type };
    case MessageType.EXPORT_POPUP_BUILD_PACKAGE: {
      const common = {
        batchRequestId: message.batchRequestId,
        intent: message.intent,
        ordinal: message.ordinal,
        options: message.options,
        type: message.type,
      };
      return message.includeWebCopy
        ? {
            ...common,
            allowAnonymousCrossOriginAssets: message.allowAnonymousCrossOriginAssets,
            allowAuthenticatedSameOriginAssets: message.allowAuthenticatedSameOriginAssets,
            includeWebCopy: true,
          }
        : { ...common, includeWebCopy: false };
    }
  }
  throw new Error('Unsupported popup export message');
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
  const target = await resolvePopupExportTarget(args.resolvedTabId);
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

type BuildPagePackageMessage = Extract<
  ViewerPortPopupExportMessage,
  { type: typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE }
>;

async function sendPopupExportBuildPackage(
  target: PopupExportTarget,
  tabId: number,
  message: BuildPagePackageMessage
): Promise<unknown> {
  return target.isOwnedSnapshotViewer
    ? sendViewerPopupExportMessage(createWebSnapshotViewerPorts(), tabId, message)
    : sendTabMessage(tabId, message);
}

async function cancelPopupExportCaptureAuthority(tabId: number, requestId: string): Promise<void> {
  const cancellation = cancelWebSnapshotCaptureRequest(tabId, requestId);
  const cleanup =
    cancellation.committedAssetIds.length > 0
      ? [deleteMediaLibraryAssetsBatchSafely(cancellation.committedAssetIds)]
      : [];
  const results = await Promise.allSettled(cleanup);
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Page Package capture cleanup failed.');
  }
}

export async function requestPopupExportPagePackage(args: {
  batchRequestId: string;
  includeWebCopy: boolean;
  intent: 'export' | 'save';
  ordinal: number;
  options: import('@sniptale/runtime-contracts/export').ExportOptions;
  tabId: number;
}): Promise<unknown> {
  const resourcePolicy: {
    allowAnonymousCrossOriginAssets?: boolean;
    allowAuthenticatedSameOriginAssets?: boolean;
  } = args.includeWebCopy
    ? await runWebSnapshotRouteStage('load web snapshot settings', async () => {
        const settings = await loadSettings();
        if (!settings.webSnapshotEnabled) {
          throw new Error('Web Snapshots are disabled in settings.');
        }
        return {
          allowAnonymousCrossOriginAssets: settings.anonymousCrossOriginSnapshotAssetsEnabled,
          allowAuthenticatedSameOriginAssets: settings.authenticatedSnapshotAssetsEnabled,
        };
      })
    : {};
  const target = await resolvePopupExportTarget(args.tabId);
  const fullPageCapture =
    args.includeWebCopy || args.options.includeFullPageScreenshot
      ? {
          contentIntentGrant: issueFullPageExportContentIntentGrant(
            args.tabId,
            MessageType.EXPORT_CAPTURE_FULL_PAGE
          ),
          fullPageCaptureAction: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        }
      : {};
  if (args.includeWebCopy) {
    authorizeWebSnapshotCaptureRequest(args.tabId, args.batchRequestId, {
      allowAnonymousCrossOriginAssets: resourcePolicy.allowAnonymousCrossOriginAssets === true,
    });
  }
  const message: BuildPagePackageMessage = args.includeWebCopy
    ? {
        allowAnonymousCrossOriginAssets: resourcePolicy.allowAnonymousCrossOriginAssets === true,
        allowAuthenticatedSameOriginAssets:
          resourcePolicy.allowAuthenticatedSameOriginAssets === true,
        batchRequestId: args.batchRequestId,
        ...fullPageCapture,
        includeWebCopy: true,
        intent: args.intent,
        ordinal: args.ordinal,
        options: args.options,
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      }
    : {
        batchRequestId: args.batchRequestId,
        ...fullPageCapture,
        includeWebCopy: false,
        intent: args.intent,
        ordinal: args.ordinal,
        options: args.options,
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      };
  let response: unknown;
  try {
    response = await sendPopupExportBuildPackage(target, args.tabId, message);
  } catch (error) {
    if (args.includeWebCopy) {
      try {
        await cancelPopupExportCaptureAuthority(args.tabId, args.batchRequestId);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Page Package routing and capture cleanup failed.',
          { cause: cleanupError }
        );
      }
    }
    throw error;
  }
  if (args.includeWebCopy) {
    const parsedResponse = isPopupExportPackageResponse(response) ? response : null;
    const validResponse =
      parsedResponse?.success === true &&
      parsedResponse.stagedPagePackage !== undefined &&
      parsedResponse.stagedPagePackage.jobId === args.batchRequestId &&
      parsedResponse.stagedPagePackage.ordinal === args.ordinal;
    const retainedSaveAuthority =
      validResponse &&
      args.intent === 'save' &&
      parsedResponse.stagedPagePackage?.snapshotSessionId !== undefined;
    const authorityMatchesIntent =
      retainedSaveAuthority ||
      (validResponse &&
        args.intent === 'export' &&
        parsedResponse.stagedPagePackage?.snapshotSessionId === undefined);
    if (!retainedSaveAuthority) {
      await cancelPopupExportCaptureAuthority(args.tabId, args.batchRequestId);
    }
    if (!authorityMatchesIntent) {
      throw new Error('Page Package response does not match requested Web-copy authority.');
    }
  }
  return response;
}

export async function cancelPopupExportPagePackage(args: {
  exportRunId: string;
  tabId: number;
}): Promise<void> {
  cancelFullPageCaptureByExportRunId(args.exportRunId);
  const message = {
    exportRunId: args.exportRunId,
    type: MessageType.EXPORT_POPUP_CANCEL,
  } as const;
  const results = await Promise.allSettled([
    cancelPopupExportCaptureAuthority(args.tabId, args.exportRunId),
    resolvePopupExportTarget(args.tabId).then((target) =>
      target.isOwnedSnapshotViewer
        ? sendViewerPopupExportMessage(createWebSnapshotViewerPorts(), args.tabId, message)
        : sendTabMessage(args.tabId, message)
    ),
  ]);
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Page Package cancellation cleanup failed.');
  }
}
