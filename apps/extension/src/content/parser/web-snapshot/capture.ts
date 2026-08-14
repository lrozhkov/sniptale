import { sanitizeDiagnosticMessage } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';
import type { FullPageExportCaptureIdentity } from '../../../contracts/full-page-capture';

export async function captureWebSnapshotScreenshot(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
  captureIdentity?: FullPageExportCaptureIdentity | undefined
): Promise<Blob> {
  return (await captureWebSnapshotScreenshotWithWarnings(contentIntentSource, captureIdentity))
    .blob;
}

export async function captureWebSnapshotScreenshotWithWarnings(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined,
  captureIdentity: FullPageExportCaptureIdentity = {
    action: MessageType.EXPORT_CAPTURE_FULL_PAGE,
    exportRunId: crypto.randomUUID(),
  }
): Promise<{ blob: Blob; warnings: string[] }> {
  const services = getContentRuntimeServices();
  const response = await services.messaging.sendRuntimeMessage(
    await services.contentActionIntent.attachContentActionIntent(
      {
        type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        exportRunId: captureIdentity.exportRunId,
      },
      contentIntentSource,
      captureIdentity.exportRunId
    )
  );
  if (!response.success || !response.dataUrl) {
    const message = sanitizeDiagnosticMessage(
      response.error ?? translate('content.runtime.captureFullPageScreenshotFailed')
    );
    throw new Error(message || translate('content.runtime.captureFullPageScreenshotFailed'));
  }
  return {
    blob: await dataUrlToBlob(response.dataUrl),
    warnings: [
      ...(response.downscaled
        ? [translate('content.runtime.captureFullPageDownscaledWarning')]
        : []),
      ...(response.frozenExtentWarning
        ? [translate('content.runtime.captureFullPageFrozenExtentWarning')]
        : []),
    ],
  };
}
