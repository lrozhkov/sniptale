/**
 * Froala export helpers extracted from the DOM parser facade.
 */
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  extractFilenameFromContentDisposition,
  resolveCredentialedDownloadUrl,
} from '../../export-manager/files/utils';
import { listFroalaIframes, resolveFroalaIframeBody } from './driver';
import { extractFullImageUrls as extractPopupImageUrls } from './popup';
import { cloneRichTextContent, sanitizeRichTextToText } from '../../rich-text-content';

const logger = createLogger({ namespace: 'ContentFroalaParser' });

export interface FroalaImageResource {
  uuid: string;
  previewSrc: string;
  fullUrl: string | null;
  downloadUuid: string | null;
  source: {
    iframeId: string;
    iframeSrc: string;
    context: string;
  };
}

async function fetchFilenameFromUrl(url: string, pageUrl: string): Promise<string | null> {
  try {
    let downloadUrl = url;
    if (url.includes('thumb=true') || url.includes('thumbnail=')) {
      downloadUrl = url.replace(/[&?]thumb=true/g, '').replace(/[&?]thumbnail=\d+/g, '');
    }
    if (url.includes('preview?uuid')) {
      downloadUrl = url.replace('preview?uuid', 'download?uuid');
    }
    if (!url.includes('download?uuid') && url.includes('uuid=file$')) {
      const uuid = url.match(/uuid=file\$(\w+)/)?.[1];
      if (uuid) {
        downloadUrl = `./download?uuid=file$${uuid}`;
      }
    }

    const resolvedUrl = resolveCredentialedDownloadUrl(downloadUrl, pageUrl);
    if (!resolvedUrl) {
      logger.warn('Blocked disallowed Froala filename request', { url: downloadUrl });
      return null;
    }

    const response = await fetch(resolvedUrl, { method: 'HEAD', credentials: 'include' });
    return response.ok
      ? extractFilenameFromContentDisposition(response.headers.get('Content-Disposition'))
      : null;
  } catch (error) {
    logger.warn('Could not fetch filename', error);
    return null;
  }
}

interface FroalaContent {
  text: string;
  images: Array<{ uuid: string; src: string; filename: string; element?: HTMLImageElement }>;
}

type FroalaOriginalImage = {
  uuid: string;
  src: string;
  filename: string;
  element: HTMLImageElement;
};

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  mapItem: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapItem(items[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));

  return results;
}

async function extractFroalaContent(
  iframe: HTMLIFrameElement,
  pageUrl: string
): Promise<FroalaContent | null> {
  try {
    const iframeBody = resolveFroalaIframeBody(iframe, pageUrl);
    if (!iframeBody) {
      return null;
    }

    const originalImgElements = iframeBody.querySelectorAll('img[src*="uuid=file$"]');
    const originalImages = (
      await mapWithConcurrency(Array.from(originalImgElements), 2, async (image) => {
        const imgEl = image as HTMLImageElement;
        const uuid = imgEl.src.match(/uuid=file\$(\w+)/)?.[1];
        if (!uuid) {
          return null;
        }

        return {
          uuid,
          src: imgEl.src,
          filename: (await fetchFilenameFromUrl(imgEl.src, pageUrl)) || `file_${uuid}`,
          element: imgEl,
        };
      })
    ).filter((image): image is FroalaOriginalImage => image !== null);

    const clone = cloneRichTextContent(iframeBody);
    clone.querySelectorAll('img[src*="uuid=file$"]').forEach((img, index) => {
      img.replaceWith(
        document.createTextNode(` [${originalImages[index]?.filename || `image_${index + 1}`}] `)
      );
    });
    const text = sanitizeRichTextToText(clone);

    return { text, images: originalImages };
  } catch (error) {
    logger.error('Error extracting Froala content', error);
    return null;
  }
}

async function extractFullImageUrls(
  iframe: HTMLIFrameElement,
  pageUrl: string
): Promise<Array<{ uuid: string; previewSrc: string; fullUrl: string | null }>> {
  const content = await extractFroalaContent(iframe, pageUrl);
  if (!content?.images.length) {
    return [];
  }
  return extractPopupImageUrls(content.images, iframe.ownerDocument);
}

function resolveDocumentPageUrl(targetDocument: Document, explicitPageUrl?: string): string {
  const normalizedPageUrl = explicitPageUrl?.trim();
  if (normalizedPageUrl) {
    return normalizedPageUrl;
  }

  return (
    targetDocument.defaultView?.location.href ??
    targetDocument.location?.href ??
    targetDocument.baseURI
  );
}

export async function collectFroalaImages(
  onProgress?: (current: number, total: number, message: string) => void,
  targetDocument: Document = document,
  pageUrl?: string
): Promise<FroalaImageResource[]> {
  const resolvedPageUrl = resolveDocumentPageUrl(targetDocument, pageUrl);
  const froalaIframes = listFroalaIframes(targetDocument);
  const results = await mapWithConcurrency(froalaIframes, 2, async (iframe, index) => {
    const iframeSrc = iframe.src || '';
    const context = iframeSrc.includes('serviceCall')
      ? 'description'
      : iframeSrc.includes('comment')
        ? 'comment'
        : 'unknown';

    onProgress?.(
      index + 1,
      froalaIframes.length,
      `Обработка Froala iframe ${index + 1}/${froalaIframes.length}...`
    );

    try {
      const imageUrls = await extractFullImageUrls(iframe, resolvedPageUrl);
      return imageUrls.map((image) => ({
        uuid: image.uuid,
        previewSrc: image.previewSrc,
        fullUrl: image.fullUrl,
        downloadUuid: image.fullUrl?.match(/uuid=file\$(\w+)/)?.[1] || null,
        source: {
          iframeId: iframe.id || '',
          iframeSrc,
          context,
        },
      }));
    } catch (error) {
      logger.error('Error extracting images from Froala iframe', iframe.id, error);
      return [];
    }
  });

  return results.flat();
}
