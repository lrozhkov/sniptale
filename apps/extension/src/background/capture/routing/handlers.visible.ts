import { createLogger } from '@sniptale/platform/observability/logger';
import { captureViewportWithClipTransaction, captureVisibleTabForCropTransaction } from '../index';
import { runGuardedCapture } from './guard';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { CaptureRouteContext } from './types';
import { createVisibleCapturePromise, runPreparedCaptureAction } from './handlers.shared';
import { completeCaptureForCropUseCase } from '../application/complete-capture-use-case';

const logger = createLogger({ namespace: 'BackgroundCaptureRouter' });

export function handleVisibleCapture(context: CaptureRouteContext): boolean {
  logger.log('Handling visible capture request', { tabId: context.resolvedTabId });
  runGuardedCapture(context.captureGuardState, () =>
    runPreparedCaptureAction({
      context,
      captureTarget: 'visible',
      capture: () =>
        createVisibleCapturePromise(
          captureViewportWithClipTransaction,
          captureVisibleTabForCropTransaction,
          context.resolvedTabId,
          context.viewportState
        ),
    })
  ).catch((error) => context.sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleVisibleCaptureForCrop(context: CaptureRouteContext): boolean {
  runGuardedCapture(context.captureGuardState, () =>
    completeCaptureForCropUseCase({
      capture: () =>
        createVisibleCapturePromise(
          captureViewportWithClipTransaction,
          captureVisibleTabForCropTransaction,
          context.resolvedTabId,
          context.viewportState
        ),
    }).then(({ dataUrl }) => {
      context.sendResponse({ success: true, dataUrl });
    })
  ).catch((error) => context.sendResponse(createRouteErrorResponse(error)));
  return true;
}
