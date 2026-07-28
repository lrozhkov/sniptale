import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import {
  getScreenshotSurfaceBinding,
  renewScreenshotSurfaceCapability,
} from '../../../capture-surface/screenshot-session';
import { getPreauthorizedContentActionRouteMessage } from '../authorization/content-action';
import { handleFullCapture } from '../handlers.full';
import { handleVisibleCapture, handleVisibleCaptureForCrop } from '../handlers.visible';
import type { CaptureRouteAdapterContext } from './types';

type ScreenshotCaptureHandler = (context: CaptureRouteAdapterContext['context']) => boolean;

export function routeScreenshotCaptureMessage(args: CaptureRouteAdapterContext): boolean {
  if (args.routeArgs.message.type === CaptureMessageType.RENEW_SCREENSHOT_SURFACE_SESSION) {
    void renewScreenshotSurfaceSession(args).catch((error: unknown) => {
      args.context.sendResponse(createRouteErrorResponse(error));
    });
    return true;
  }
  const handler = resolveScreenshotCaptureHandler(args.routeArgs.message);
  if (!handler) {
    return false;
  }

  void authorizeScreenshotCapture(args)
    .then(() => {
      handler(args.context);
    })
    .catch((error: unknown) => {
      args.context.sendResponse(createRouteErrorResponse(error));
    });
  return true;
}

async function renewScreenshotSurfaceSession(args: CaptureRouteAdapterContext): Promise<void> {
  await authorizeScreenshotCapture(args);
  const senderBinding = getPreauthorizedContentActionRouteMessage(args.routeArgs.message);
  if (!senderBinding || senderBinding.tabId !== args.context.resolvedTabId) {
    throw new Error('Unauthorized screenshot surface renewal');
  }

  renewScreenshotSurfaceCapability({
    documentId: senderBinding.documentId,
    tabId: args.context.resolvedTabId,
  });
  args.context.screenshotModeState.set(args.context.resolvedTabId, true);
  const binding = getScreenshotSurfaceBinding(args.context.resolvedTabId);
  if (!binding) throw new Error('Screenshot surface session is unavailable');
  args.context.sendResponse({ success: true, ...binding });
}

function resolveScreenshotCaptureHandler(
  message: CaptureRouteAdapterContext['routeArgs']['message']
): ScreenshotCaptureHandler | null {
  if (message.type === CaptureMessageType.CAPTURE_VISIBLE) {
    return handleVisibleCapture;
  }
  if (message.type === CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP) {
    return handleVisibleCaptureForCrop;
  }
  if (message.type === CaptureMessageType.CAPTURE_FULL) {
    return handleFullCapture;
  }
  return null;
}

async function authorizeScreenshotCapture(args: CaptureRouteAdapterContext): Promise<void> {
  const { pageAccessPort } = args.routeArgs;
  if (!pageAccessPort) {
    throw new Error('Page access port unavailable.');
  }

  await pageAccessPort.ensureActivePageAccessRuntime(args.context.resolvedTabId);
  if (isNativeVisibleCapture(args)) {
    await pageAccessPort.ensureNativeVisibleCaptureAuthority(args.context.resolvedTabId);
  }
}

function isNativeVisibleCapture(args: CaptureRouteAdapterContext): boolean {
  const message = args.routeArgs.message;
  if (
    message.type !== CaptureMessageType.CAPTURE_VISIBLE &&
    message.type !== CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP
  ) {
    return false;
  }

  const viewport = args.context.viewportState.get(args.context.resolvedTabId);
  return viewport === null || viewport === undefined || viewport.target === 'window';
}
