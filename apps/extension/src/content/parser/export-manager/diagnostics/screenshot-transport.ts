import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { translate } from '../../../../platform/i18n';
import { dataUrlToBlob } from '../../../../platform/media-utils/data-url';
import { getContentRuntimeServices } from '../../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentPrivilegedActionIntentSource } from '../../../platform/privileged-action-intent/client';
import type { ArchiveAsset } from '../archive';

function isDebuggerScreenshotFailure(message: string): boolean {
  return [
    'Debugger is not attached',
    'already attached',
    'Cannot attach',
    'Another client',
    'DevTools',
  ].some((fragment) => message.includes(fragment));
}

function getFullPageScreenshotErrorMessage(error: unknown): string {
  const message = sanitizeDiagnosticMessage(
    error instanceof Error ? error.message : String(error ?? '')
  );
  if (message && isDebuggerScreenshotFailure(message)) {
    return translate('content.runtime.captureFullPageScreenshotRetryHint');
  }

  return message || 'Failed to capture full-page screenshot.';
}

/**
 * Capture a full-page screenshot through background and return it as an archive asset.
 */
export async function captureFullPageScreenshotAsset(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
): Promise<ArchiveAsset> {
  const services = getContentRuntimeServices();
  const response = await services.messaging.sendRuntimeMessage(
    await services.contentActionIntent.attachContentActionIntent(
      {
        type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
      },
      contentIntentSource
    )
  );

  if (!response.success || !response.dataUrl) {
    throw new Error(getFullPageScreenshotErrorMessage(response.error));
  }

  return {
    path: 'page-screenshot.png',
    content: await dataUrlToBlob(response.dataUrl),
  };
}
