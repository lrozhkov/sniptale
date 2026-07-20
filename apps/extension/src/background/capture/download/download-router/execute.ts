import type { CaptureActionType } from '../../../../contracts/settings';
import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getLastSaveAsDirectory } from '../save-directory';
import { transitionCaptureJob } from '../../jobs/state-machine';
import { defaultDownloadRouterService } from './service-singleton';
import { buildDownloadFilename, resolvePresetPath } from './path';

const logger = createLogger({ namespace: 'BackgroundDownloadRouter' });
const BLOB_DOWNLOAD_URL_FALLBACK_CLEANUP_MS = 5 * 60 * 1000;
const MAX_BACKGROUND_DATA_URL_DOWNLOAD_BYTES = 64 * 1024 * 1024;

async function createDownloadUrl(
  blob: Blob
): Promise<{ cleanup: (() => void) | null; url: string }> {
  if (typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);

    return {
      cleanup: () => URL.revokeObjectURL(url),
      url,
    };
  }

  return {
    cleanup: null,
    url: await blobToDownloadDataUrl(blob),
  };
}

async function blobToDownloadDataUrl(blob: Blob): Promise<string> {
  if (blob.size > MAX_BACKGROUND_DATA_URL_DOWNLOAD_BYTES) {
    throw new Error('Blob download fallback payload exceeds background data URL budget.');
  }
  const mimeType = blob.type || 'application/octet-stream';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${sanitizeDownloadDataUrlMimeType(mimeType)};base64,${bytesToBase64(bytes)}`;
}

function sanitizeDownloadDataUrlMimeType(mimeType: string): string {
  return mimeType.includes(',')
    ? mimeType.split(';', 1)[0] || 'application/octet-stream'
    : mimeType;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function trackDownloadUrlCleanup(
  downloadId: number | undefined,
  cleanup: (() => void) | null,
  captureJobId?: string | undefined
): Promise<void> {
  if (!cleanup && !captureJobId) {
    return;
  }

  if (typeof downloadId !== 'number') {
    if (cleanup) {
      setTimeout(cleanup, BLOB_DOWNLOAD_URL_FALLBACK_CLEANUP_MS);
    }
    return;
  }

  await defaultDownloadRouterService.rememberPendingDownload(
    downloadId,
    cleanup ?? (() => undefined),
    'generic',
    captureJobId
  );
}

async function failCaptureJobWithoutDownloadId(captureJobId: string | undefined): Promise<void> {
  if (!captureJobId) {
    return;
  }

  await transitionCaptureJob(captureJobId, 'failed', {
    error: 'Download did not return an id',
  });
}

export async function executeDownload(
  dataUrl: string,
  filename: string,
  actionType: CaptureActionType,
  presetId?: string | null,
  captureJobId?: string | undefined
): Promise<void> {
  if (actionType === 'copy' || actionType === 'edit' || actionType === 'scenario') {
    return;
  }

  if (actionType === 'ask_system') {
    const saveAsAttempt = defaultDownloadRouterService.beginSaveAsDownloadAttempt(captureJobId);
    const lastDir = await getLastSaveAsDirectory();
    const filenameWithDir = buildDownloadFilename(lastDir || null, filename);
    const downloadId = await browserDownloads.download({
      url: dataUrl,
      filename: filenameWithDir,
      saveAs: true,
    });

    await saveAsAttempt.register(downloadId);
    if (typeof downloadId !== 'number') {
      await failCaptureJobWithoutDownloadId(captureJobId);
    }

    logger.log('Saved via system dialog', filenameWithDir);
    return;
  }

  const path = await resolvePresetPath(presetId ?? undefined);
  const finalFilename = buildDownloadFilename(path, filename);
  const downloadId = await browserDownloads.download({
    url: dataUrl,
    filename: finalFilename,
    saveAs: false,
  });
  if (captureJobId && typeof downloadId === 'number') {
    await defaultDownloadRouterService.rememberPendingDownload(
      downloadId,
      () => undefined,
      'generic',
      captureJobId
    );
  }
  if (typeof downloadId !== 'number') {
    await failCaptureJobWithoutDownloadId(captureJobId);
  }
  logger.log('Saved to preset path', finalFilename);
}

export async function executeDownloadBlob(
  blob: Blob,
  filename: string,
  presetId?: string | null,
  captureJobId?: string | undefined
): Promise<number | undefined> {
  const path = await resolvePresetPath(presetId ?? undefined);
  const finalFilename = buildDownloadFilename(path, filename);
  const downloadUrl = await createDownloadUrl(blob);

  try {
    const downloadId = await browserDownloads.download({
      url: downloadUrl.url,
      filename: finalFilename,
      saveAs: false,
    });
    await trackDownloadUrlCleanup(downloadId, downloadUrl.cleanup, captureJobId);
    if (typeof downloadId !== 'number') {
      await failCaptureJobWithoutDownloadId(captureJobId);
    }
    logger.log('Blob saved', finalFilename);
    return downloadId;
  } catch (error) {
    downloadUrl.cleanup?.();
    throw error;
  }
}
