import { captureFullPageScreenshotAsset } from '../export-manager/diagnostics';
import type { ContentPrivilegedActionIntentSource } from '../../platform/privileged-action-intent/client';

export async function captureWebSnapshotScreenshot(
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
): Promise<Blob> {
  const asset = await captureFullPageScreenshotAsset(contentIntentSource);
  if (!(asset.content instanceof Blob)) {
    return new Blob([asset.content], { type: 'image/png' });
  }
  return asset.content;
}
