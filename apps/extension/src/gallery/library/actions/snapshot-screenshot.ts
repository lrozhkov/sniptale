import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getWebSnapshotScreenshotFile } from '../../../composition/persistence/web-snapshots';
import { persistPendingEditorBootstrapPayload } from '../../../workflows/editor/bootstrap/index';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import type { GalleryPreviewController } from './controller-types';
import { isGalleryMediaItem } from '../items';
import { createMissingBlobError, type GalleryBusyAction } from './shared';
import { validateWebSnapshotScreenshotBlob } from '../../../features/web-snapshot/screenshot-validation';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read snapshot screenshot.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });
}

export async function openSnapshotScreenshotInEditor(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
): Promise<void> {
  const previewItem = controller.state.preview.session.item;
  if (!previewItem || !isGalleryMediaItem(previewItem) || previewItem.kind !== 'web-archive') {
    return;
  }

  await withBusy(async () => {
    const screenshotBlob = await getWebSnapshotScreenshotFile(
      previewItem.entityId ?? previewItem.id
    );
    if (!screenshotBlob) {
      throw createMissingBlobError(previewItem.filename);
    }
    await validateWebSnapshotScreenshotBlob(screenshotBlob);
    const bootstrapId = await persistPendingEditorBootstrapPayload({
      dataUrl: await blobToDataUrl(screenshotBlob),
      sourceFaviconUrl: previewItem.sourceFavicon,
      title: previewItem.sourceTitle ?? previewItem.filename,
      url: previewItem.sourceUrl ?? '',
    });

    await browserTabs.create({
      url: buildEditorUrl({
        bootstrapId,
      }),
    });
  });
}
