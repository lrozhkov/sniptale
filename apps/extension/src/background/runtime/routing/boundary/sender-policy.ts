import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RouteCaptureMessage } from '../../../capture/routes';
import { authorizeContentSender } from '../../../routing-contracts/capabilities/content-action/sender-binding';
import { isPopupTabRouteSenderUrl } from '../capabilities/popup-tab/route-capabilities';

type CaptureRouteSenderPolicyArgs = {
  message: RouteCaptureMessage;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
};

export type PrivilegedTabRouteFamily =
  | 'capture'
  | 'page-style'
  | 'scenario'
  | 'tab-mode'
  | 'video-control';

type PrivilegedTabRouteSenderPolicyArgs = {
  family: PrivilegedTabRouteFamily;
  message?: RouteCaptureMessage;
  resolvedTabId: number;
  sender: chrome.runtime.MessageSender | undefined;
};

type TabRouteAuthorizationPolicy = {
  popup: boolean;
  senderOwnedTab: boolean;
  viewer: boolean;
};

const privilegedTabRouteAuthorizationMatrix = {
  capture: { popup: false, senderOwnedTab: true, viewer: false },
  'page-style': { popup: true, senderOwnedTab: true, viewer: false },
  scenario: { popup: false, senderOwnedTab: true, viewer: true },
  'tab-mode': { popup: true, senderOwnedTab: true, viewer: false },
  'video-control': { popup: true, senderOwnedTab: false, viewer: false },
} satisfies Record<PrivilegedTabRouteFamily, TabRouteAuthorizationPolicy>;

const unauthorizedRouteErrors = {
  capture: 'Unauthorized capture route sender',
  'page-style': 'Unauthorized page-style route sender',
  scenario: 'Unauthorized scenario route sender',
  'tab-mode': 'Unauthorized tab-mode route sender',
  'video-control': 'Unauthorized video-control route sender',
} satisfies Record<PrivilegedTabRouteFamily, string>;

const editorCaptureRoutes = new Set<string>([
  MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
  MessageType.EXECUTE_SAVE,
  MessageType.UPDATE_GALLERY_IMAGE_ASSET,
]);
const popupCaptureRoutes = new Set<string>([MessageType.TRIGGER_QUICK_ACTION]);
const viewerCaptureRoutes = new Set<string>([
  MessageType.FETCH_WEB_SNAPSHOT_ASSET,
  MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
  MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY,
  MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
  MessageType.TRIGGER_QUICK_ACTION,
]);

function isOwnedExtensionDocument(senderUrl: string | undefined, path: string): boolean {
  if (!senderUrl) {
    return false;
  }

  try {
    const expectedUrl = new URL(runtimeInfo.getURL(path));
    const candidateUrl = new URL(senderUrl);
    return (
      candidateUrl.origin === expectedUrl.origin && candidateUrl.pathname === expectedUrl.pathname
    );
  } catch {
    return false;
  }
}

function isAuthorizedEditorCaptureRoute(
  message: RouteCaptureMessage,
  sender: chrome.runtime.MessageSender | undefined
): boolean {
  return (
    isOwnedExtensionDocument(sender?.url, 'apps/extension/src/editor/index.html') &&
    editorCaptureRoutes.has(message.type)
  );
}

function isAuthorizedPopupCaptureRoute(
  message: RouteCaptureMessage,
  sender: chrome.runtime.MessageSender | undefined
): boolean {
  return isPopupTabRouteSenderUrl(sender?.url) && popupCaptureRoutes.has(message.type);
}

function isAuthorizedViewerCaptureRoute(
  message: RouteCaptureMessage,
  sender: chrome.runtime.MessageSender | undefined
): boolean {
  return isOwnedSnapshotViewerPage(sender?.url) && viewerCaptureRoutes.has(message.type);
}

export function canRouteCaptureMessageFromSender(args: CaptureRouteSenderPolicyArgs): boolean {
  return (
    authorizeContentSender(args.sender, args.resolvedTabId).allowed ||
    isAuthorizedEditorCaptureRoute(args.message, args.sender) ||
    isAuthorizedPopupCaptureRoute(args.message, args.sender) ||
    isAuthorizedViewerCaptureRoute(args.message, args.sender)
  );
}

function canRoutePrivilegedTabMessageFromSender(args: PrivilegedTabRouteSenderPolicyArgs): boolean {
  if (args.family === 'capture') {
    return (
      args.message !== undefined &&
      canRouteCaptureMessageFromSender({
        message: args.message,
        resolvedTabId: args.resolvedTabId,
        sender: args.sender,
      })
    );
  }

  const policy = privilegedTabRouteAuthorizationMatrix[args.family];
  if (policy.senderOwnedTab && authorizeContentSender(args.sender, args.resolvedTabId).allowed) {
    return true;
  }
  if (policy.popup && isPopupTabRouteSenderUrl(args.sender?.url)) {
    return true;
  }
  if (policy.viewer && isOwnedSnapshotViewerPage(args.sender?.url)) {
    return true;
  }

  return false;
}

export function getUnauthorizedPrivilegedTabRouteSenderReason(
  args: PrivilegedTabRouteSenderPolicyArgs
): string | null {
  return canRoutePrivilegedTabMessageFromSender(args) ? null : unauthorizedRouteErrors[args.family];
}
