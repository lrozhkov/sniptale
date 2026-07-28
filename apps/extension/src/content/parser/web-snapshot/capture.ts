import { captureFullPageScreenshotAsset } from '../export-manager/diagnostics';
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
  captureIdentity?: FullPageExportCaptureIdentity | undefined
): Promise<{ blob: Blob; warnings: string[] }> {
  const asset = await captureFullPageScreenshotAsset(contentIntentSource, captureIdentity);
  return {
    blob:
      asset.content instanceof Blob
        ? asset.content
        : new Blob([asset.content], { type: 'image/png' }),
    warnings: asset.captureWarnings,
  };
}
