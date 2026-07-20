import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { handleFullCapture, handleVisibleCapture, handleVisibleCaptureForCrop } from '../handlers';
import type { CaptureRouteAdapterContext } from './types';

type ScreenshotCaptureHandler = (context: CaptureRouteAdapterContext['context']) => boolean;

export function routeScreenshotCaptureMessage(args: CaptureRouteAdapterContext): boolean {
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
  return viewport === null || viewport === undefined;
}
