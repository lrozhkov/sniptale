import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import { persistPendingEditorBootstrapPayload } from '../../../workflows/editor/bootstrap/index';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import type { GalleryPreviewController } from './controller-types';
import { isGalleryMediaItem } from '../items';
import { loadWebSnapshotScreenshotBlob } from '../../web-snapshot/package';
import { createMissingBlobError, type GalleryBusyAction } from './shared';

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
    const packageBlob = await getMediaAssetBlob(previewItem.entityId ?? previewItem.id);
    if (!packageBlob) {
      throw createMissingBlobError(previewItem.filename);
    }

    const screenshotBlob = await loadWebSnapshotScreenshotBlob(packageBlob);
    const bootstrapId = await persistPendingEditorBootstrapPayload({
      dataUrl: await blobToDataUrl(screenshotBlob),
      sourceFaviconUrl: previewItem.sourceFavicon,
      title: previewItem.sourceTitle ?? previewItem.filename,
      url: previewItem.sourceUrl ?? '',
    });

    await browserTabs.create({
      url: buildEditorUrl({
        bootstrapId,
        sessionId: createEditorSessionId(),
      }),
    });
  });
}
