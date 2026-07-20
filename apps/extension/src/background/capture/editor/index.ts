import { browserTabs } from '@sniptale/platform/browser/tabs';
import { persistPendingEditorBootstrapPayload } from '../../../workflows/editor/bootstrap/index';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  MAX_SAVE_BLOB_BASE64_DECODED_BYTES,
  isBoundedBase64,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';

const logger = createLogger({ namespace: 'BackgroundCaptureEditor' });

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function resolveBlobFromPayload(payload: {
  base64?: string;
  mimeType?: string;
  blob?: Blob;
}): Promise<Blob | undefined> {
  if (payload.base64 != null) {
    const mimeType = payload.mimeType || 'application/octet-stream';
    if (
      !isBoundedBase64(payload.base64, MAX_SAVE_BLOB_BASE64_DECODED_BYTES) ||
      !isSafeDownloadMimeType(mimeType)
    ) {
      return Promise.reject(new Error('Invalid base64 blob payload'));
    }
    return Promise.resolve(base64ToBlob(payload.base64, mimeType));
  }

  return Promise.resolve(payload.blob);
}

async function resolveEditorSourceMetadata(sourceContext?: {
  tabId?: number;
  url?: string | null;
  title?: string | null;
}): Promise<{ sourceFaviconUrl: string | null; sourceUrl: string; sourceTitle: string }> {
  let sourceUrl = sourceContext?.url ?? '';
  let sourceTitle = sourceContext?.title ?? '';
  let sourceFaviconUrl: string | null = null;

  if (sourceContext?.tabId) {
    try {
      const sourceTab = await browserTabs.get(sourceContext.tabId);
      sourceUrl = sourceTab.url ?? sourceUrl;
      sourceTitle = sourceTab.title ?? sourceTitle;
      sourceFaviconUrl = sourceTab.favIconUrl ?? null;
    } catch (error) {
      logger.warn('Failed to resolve source tab for editor payload', error);
    }

    return { sourceFaviconUrl, sourceUrl, sourceTitle };
  }

  if (!sourceUrl && !sourceTitle) {
    const [activeTab] = await browserTabs.query({ active: true, currentWindow: true });
    sourceUrl = activeTab?.url ?? '';
    sourceTitle = activeTab?.title ?? '';
    sourceFaviconUrl = activeTab?.favIconUrl ?? null;
  }

  return { sourceFaviconUrl, sourceUrl, sourceTitle };
}

async function persistEditorBootstrapId(payload: {
  dataUrl: string;
  sourceFaviconUrl: string | null;
  url: string;
  title: string;
}): Promise<string | null> {
  try {
    return await persistPendingEditorBootstrapPayload({
      dataUrl: payload.dataUrl,
      sourceFaviconUrl: payload.sourceFaviconUrl,
      url: payload.url,
      title: payload.title,
    });
  } catch (error) {
    logger.warn('Failed to persist editor bootstrap payload', error);
    return null;
  }
}

function createEditorTabUrl(bootstrapId: string | null): string {
  return buildEditorUrl({
    bootstrapId,
    sessionId: createEditorSessionId(),
  });
}

export async function openEditorWithImage(
  dataUrl: string,
  sourceContext?: { tabId?: number; url?: string | null; title?: string | null }
): Promise<void> {
  const { sourceFaviconUrl, sourceUrl, sourceTitle } =
    await resolveEditorSourceMetadata(sourceContext);
  const bootstrapId = await persistEditorBootstrapId({
    dataUrl,
    sourceFaviconUrl,
    url: sourceUrl,
    title: sourceTitle,
  });
  await browserTabs.create({ url: createEditorTabUrl(bootstrapId) });
}
