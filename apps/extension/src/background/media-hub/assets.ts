import { browserTabs } from '@sniptale/platform/browser/tabs';
import { saveScreenshotMediaAssetSafely } from '../../workflows/media-hub/store';
import { createMediaHubStorageHeadroomError } from '../../features/media-hub/storage-errors';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';
import { ensureMediaHubStorageHeadroom } from '../../features/media-hub/storage-capacity';

interface CaptureSourceMeta {
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceFavicon: string | null;
}

async function resolveCaptureSourceMeta(tabId?: number): Promise<CaptureSourceMeta> {
  if (!tabId) {
    return {
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
    };
  }

  try {
    const tab = await browserTabs.get(tabId);
    return {
      sourceUrl: tab.url ?? null,
      sourceTitle: tab.title ?? null,
      sourceFavicon: tab.favIconUrl ?? null,
    };
  } catch {
    return {
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
    };
  }
}

async function ensureScreenshotStorageHeadroom(): Promise<void> {
  try {
    await ensureMediaHubStorageHeadroom();
  } catch (error) {
    throw createMediaHubStorageHeadroomError(error) ?? error;
  }
}

export async function saveScreenshotToMediaHubFromDataUrl(
  dataUrl: string,
  filename: string,
  tabId?: number,
  storageClass: 'temporary' | 'library' = 'temporary'
): Promise<string> {
  await ensureScreenshotStorageHeadroom();
  const [blob, sourceMeta] = await Promise.all([
    dataUrlToBlob(dataUrl),
    resolveCaptureSourceMeta(tabId),
  ]);

  const entry = await saveScreenshotMediaAssetSafely({
    blob,
    filename,
    sourceUrl: sourceMeta.sourceUrl,
    sourceTitle: sourceMeta.sourceTitle,
    sourceFavicon: sourceMeta.sourceFavicon,
    storageClass,
  });

  return entry.id;
}
