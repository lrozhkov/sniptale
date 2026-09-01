import { captureFullPageTransaction } from '../index';
import { runGuardedCapture } from './guard';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { CaptureRouteContext } from './types';
import { runPreparedCaptureAction } from './handlers.shared';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';

async function reportFullPageCaptureWarning(
  tabId: number,
  capture: Awaited<ReturnType<typeof captureFullPageTransaction>>
): Promise<void> {
  const warnings = [
    ...(capture.metadata.downscaled
      ? [translate('content.runtime.captureFullPageDownscaledWarning')]
      : []),
    ...(capture.metadata.frozenExtentWarning
      ? [translate('content.runtime.captureFullPageFrozenExtentWarning')]
      : []),
    ...(capture.metadata.viewportFallback
      ? [translate('content.runtime.captureFullPageViewportFallbackWarning')]
      : []),
  ];
  if (warnings.length === 0) return;
  await getBackgroundRuntimeMessaging()
    .sendTabMessage(tabId, {
      type: MessageType.SHOW_TOAST,
      payload: { message: warnings.join(' '), type: 'warning' },
    })
    .catch(() => undefined);
}

export function handleFullCapture(context: CaptureRouteContext): boolean {
  const binding = context.contentPreauthorization;
  runGuardedCapture(context.captureGuardState, () =>
    runPreparedCaptureAction({
      context,
      captureTarget: 'full',
      capture: async () => {
        const capture = await captureFullPageTransaction(context.resolvedTabId, undefined, {
          backendKind: 'native',
          ...(binding?.documentId === undefined ? {} : { documentId: binding.documentId }),
        });
        await reportFullPageCaptureWarning(context.resolvedTabId, capture);
        return capture;
      },
    })
  ).catch((error) => context.sendResponse(createRouteErrorResponse(error)));
  return true;
}
