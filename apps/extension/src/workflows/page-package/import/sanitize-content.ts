import type { PagePackageEntry } from '@sniptale/runtime-contracts/page-package';
import {
  collectWebSnapshotQueryRoots,
  isWebSnapshotXhtml,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotHtml,
  sanitizeWebSnapshotStylesheetText,
  sanitizeWebSnapshotSvgText,
  sanitizeWebSnapshotXhtml,
  serializeWebSnapshotXhtmlDocument,
  validateImportedWebSnapshotAsset,
} from '../../../features/web-snapshot/public';

const URL_ATTRIBUTES = ['href', 'poster', 'src'] as const;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function decodeText(blob: Blob, path: string): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    try {
      return UTF8_DECODER.decode(buffer);
    } catch {
      throw new Error(`Page Package text entry is not valid UTF-8: ${path}.`);
    }
  });
}

function resolveLocalAssetPath(
  value: string,
  sourcePath: string,
  assetPaths: ReadonlySet<string>
): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed;
  try {
    const base = new URL(sourcePath, 'https://sniptale.invalid/');
    const resolved = new URL(trimmed, base);
    if (resolved.origin !== base.origin || resolved.search || resolved.hash) return null;
    const path = decodeURIComponent(resolved.pathname.replace(/^\//u, ''));
    return assetPaths.has(path) ? path : null;
  } catch {
    return null;
  }
}

function rewriteSrcset(
  value: string,
  sourcePath: string,
  assetPaths: ReadonlySet<string>
): string | null {
  const candidates = value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [url = '', ...descriptor] = candidate.split(/\s+/u);
      const localPath = resolveLocalAssetPath(url, sourcePath, assetPaths);
      return localPath ? `${localPath} ${descriptor.join(' ')}`.trim() : null;
    });
  return candidates.length > 0 && candidates.every((candidate) => candidate !== null)
    ? candidates.join(', ')
    : null;
}

function rewriteDocumentAssetReferences(
  source: string,
  sourcePath: string,
  assetPaths: ReadonlySet<string>,
  xhtml: boolean
): string {
  const document = new DOMParser().parseFromString(
    source,
    xhtml ? 'application/xhtml+xml' : 'text/html'
  );
  if (xhtml && document.querySelector('parsererror')) {
    throw new Error('Page Package Web-copy XHTML is invalid.');
  }
  const rewriteCss = (value: string) =>
    sanitizeWebSnapshotCssText(value, (url) => resolveLocalAssetPath(url, sourcePath, assetPaths));
  for (const root of collectWebSnapshotQueryRoots(document)) {
    for (const element of root.querySelectorAll('*')) {
      for (const attribute of URL_ATTRIBUTES) {
        if (attribute === 'href' && element.tagName.toLowerCase() === 'a') continue;
        const value = element.getAttribute(attribute);
        if (value === null) continue;
        const localPath = resolveLocalAssetPath(value, sourcePath, assetPaths);
        if (localPath) element.setAttribute(attribute, localPath);
        else element.removeAttribute(attribute);
      }
      const srcset = element.getAttribute('srcset');
      if (srcset !== null) {
        const rewritten = rewriteSrcset(srcset, sourcePath, assetPaths);
        if (rewritten) element.setAttribute('srcset', rewritten);
        else element.removeAttribute('srcset');
      }
      const style = element.getAttribute('style');
      if (style !== null) element.setAttribute('style', rewriteCss(style));
    }
    for (const style of root.querySelectorAll('style')) {
      style.textContent = sanitizeWebSnapshotStylesheetText(style.textContent ?? '', (url) =>
        resolveLocalAssetPath(url, sourcePath, assetPaths)
      );
    }
  }
  return xhtml
    ? serializeWebSnapshotXhtmlDocument(document)
    : `<!doctype html>${document.documentElement.outerHTML}`;
}

export async function sanitizeImportedPagePackageEntry(args: {
  assetPaths: ReadonlySet<string>;
  blob: Blob;
  entry: PagePackageEntry;
  sourceUrl: string | null;
}): Promise<Blob> {
  if (args.entry.path === 'snapshot/index.html') {
    const source = await decodeText(args.blob, args.entry.path);
    const xhtml = isWebSnapshotXhtml(source);
    const rewritten = rewriteDocumentAssetReferences(
      source,
      args.entry.path,
      args.assetPaths,
      xhtml
    );
    const options = {
      allowedObjectUrls: Array.from(args.assetPaths),
      offlineOnly: true,
      removeForms: true,
    } as const;
    const sanitized = xhtml
      ? sanitizeWebSnapshotXhtml(rewritten, args.sourceUrl, options)
      : sanitizeWebSnapshotHtml(rewritten, args.sourceUrl, options);
    return new Blob([sanitized], { type: args.entry.mimeType });
  }
  if (args.entry.component === 'webCopy' && args.entry.mimeType === 'text/css') {
    const source = await decodeText(args.blob, args.entry.path);
    return new Blob(
      [
        sanitizeWebSnapshotStylesheetText(source, (url) =>
          resolveLocalAssetPath(url, args.entry.path, args.assetPaths)
        ),
      ],
      { type: 'text/css' }
    );
  }
  if (args.entry.component === 'webCopy' && args.entry.mimeType === 'image/svg+xml') {
    return new Blob([sanitizeWebSnapshotSvgText(await decodeText(args.blob, args.entry.path))], {
      type: 'image/svg+xml',
    });
  }
  if (args.entry.component === 'webCopy' && args.entry.path.startsWith('assets/')) {
    await validateImportedWebSnapshotAsset(args.blob, args.entry.mimeType, args.entry.path);
  }
  if (
    args.entry.component === 'diagnostics' ||
    args.entry.mimeType.startsWith('text/') ||
    args.entry.mimeType === 'application/json'
  ) {
    await decodeText(args.blob, args.entry.path);
  }
  return args.blob;
}
