import type { FileResource } from '@sniptale/runtime-contracts/export';

import { isContentOwnedElement } from '../../../platform/dom-host';
import { getCurrentExportPageUrl, listPageImages } from '../diagnostics/dom-driver';
import { resolveDiagnosticsDocument, type ExportDiagnosticsSource } from '../diagnostics/source';
import {
  generateFilename,
  getFileExtension,
  resolveCredentialedDownloadUrl,
} from './download-utils';

const MIN_CONTENT_IMAGE_EDGE_PX = 32;

function isImageExtension(extension: string | null): boolean {
  return (
    extension === 'avif' ||
    extension === 'gif' ||
    extension === 'jpeg' ||
    extension === 'jpg' ||
    extension === 'png' ||
    extension === 'svg' ||
    extension === 'webp'
  );
}

function readImageDimensions(image: HTMLImageElement): { height: number; width: number } | null {
  const width = image.naturalWidth || image.width || Number(image.getAttribute('width')) || 0;
  const height = image.naturalHeight || image.height || Number(image.getAttribute('height')) || 0;
  return width > 0 && height > 0 ? { height, width } : null;
}

function isLikelyContentImage(image: HTMLImageElement): boolean {
  const dimensions = readImageDimensions(image);
  return (
    dimensions === null ||
    dimensions.width >= MIN_CONTENT_IMAGE_EDGE_PX ||
    dimensions.height >= MIN_CONTENT_IMAGE_EDGE_PX
  );
}

function resolveLinkedOriginal(image: HTMLImageElement, pageUrl: string): string | null {
  const anchor = image.closest<HTMLAnchorElement>('a[href]');
  const href = anchor?.getAttribute('href') ?? null;
  const resolved = resolveCredentialedDownloadUrl(href, pageUrl);
  const extension = resolved ? getFileExtension(resolved) : null;
  return isImageExtension(extension) ? resolved : null;
}

function resolveDisplayedImage(image: HTMLImageElement, pageUrl: string): string | null {
  return resolveCredentialedDownloadUrl(image.currentSrc || image.getAttribute('src'), pageUrl);
}

/**
 * Collects ordinary page images without interacting with page controls. The browser-selected
 * currentSrc is authoritative for responsive images; malformed srcset values are never reparsed.
 */
export function collectPageImageResources(source?: ExportDiagnosticsSource): FileResource[] {
  const documentRoot = resolveDiagnosticsDocument(source);
  const pageUrl = getCurrentExportPageUrl(source?.pageUrl) || 'https://sniptale.invalid';
  const resources: FileResource[] = [];
  const seenUrls = new Set<string>();

  for (const image of listPageImages(documentRoot)) {
    if (isContentOwnedElement(image) || !isLikelyContentImage(image)) continue;
    const url = resolveLinkedOriginal(image, pageUrl) ?? resolveDisplayedImage(image, pageUrl);
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    const fallback = image.alt.trim() || image.title.trim() || `image_${resources.length + 1}`;
    resources.push({
      filename: generateFilename(url, fallback, resources.length + 1),
      source: 'page-image',
      url,
    });
  }

  return resources;
}
