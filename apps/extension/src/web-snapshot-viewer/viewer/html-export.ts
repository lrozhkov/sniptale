import {
  appendWebSnapshotAssetFragment,
  collectWebSnapshotQueryRoots,
  isWebSnapshotXhtml,
  sanitizeWebSnapshotXhtml,
  resolveWebSnapshotLocalAssetReference,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotFilename,
  sanitizeWebSnapshotHtml,
  sanitizeWebSnapshotStylesheetText,
  sanitizeWebSnapshotSvgText,
} from '../../features/web-snapshot/public';
import { blobToDataUrl } from '../../platform/media-utils/data-url';
import type { LoadedWebSnapshotPackage } from './assets';

const MAX_EXPORT_CHARACTERS = 350 * 1024 * 1024;
const MAX_CSS_DEPTH = 32;
const EXPORT_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'img-src data:',
  'font-src data:',
  "style-src 'unsafe-inline' data:",
  'media-src data:',
].join('; ');

function assertExportSize(size: number): void {
  if (size > MAX_EXPORT_CHARACTERS) throw new Error('Snapshot HTML export is too large.');
}

function cssDataUrl(css: string): string {
  const bytes = new TextEncoder().encode(css);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return `data:text/css;charset=utf-8;base64,${btoa(chunks.join(''))}`;
}

async function createEmbeddedAssets(
  loaded: LoadedWebSnapshotPackage
): Promise<Map<string, string>> {
  const urlsByPath = new Map<string, string>();
  const stylesByPath = new Map<string, string>();
  const paths = new Set(loaded.assets.map((asset) => asset.path));
  let totalCharacters = 0;
  const retain = (path: string, value: string) => {
    totalCharacters += value.length;
    assertExportSize(totalCharacters);
    urlsByPath.set(path, value);
    return value;
  };
  for (const asset of loaded.assets) {
    const blob = await loaded.extractPackageFile(asset.path);
    if (asset.mimeType === 'text/css') {
      stylesByPath.set(asset.path, await blob.text());
    } else {
      const safeBlob =
        asset.mimeType === 'image/svg+xml'
          ? new Blob([sanitizeWebSnapshotSvgText(await blob.text())], { type: asset.mimeType })
          : blob;
      retain(asset.path, await blobToDataUrl(safeBlob));
    }
  }
  const visiting = new Set<string>();
  const resolvePath = (path: string): string | null => {
    const existing = urlsByPath.get(path);
    if (existing) return existing;
    const css = stylesByPath.get(path);
    if (css === undefined || visiting.has(path)) return null;
    if (visiting.size >= MAX_CSS_DEPTH) throw new Error('Snapshot CSS nesting is too deep.');
    visiting.add(path);
    try {
      let expandedSize = css.length;
      const rewritten = sanitizeWebSnapshotStylesheetText(css, (value) => {
        if (value.startsWith('#')) return value;
        const reference = resolveWebSnapshotLocalAssetReference(value, path, paths);
        if (!reference) return null;
        const url = resolvePath(reference.path);
        expandedSize += url?.length ?? 0;
        assertExportSize(expandedSize);
        return url ? appendWebSnapshotAssetFragment(url, reference.fragment) : null;
      });
      assertExportSize(rewritten.length);
      return retain(path, cssDataUrl(rewritten));
    } finally {
      visiting.delete(path);
    }
  };
  for (const path of stylesByPath.keys()) resolvePath(path);
  return new Map(loaded.assets.map((asset) => [asset.url, urlsByPath.get(asset.path)!]));
}

function rewriteDocument(document: Document, embedded: Map<string, string>): void {
  let expandedSize = document.documentElement.outerHTML.length;
  const resolve = (value: string): string | null => {
    const fragmentIndex = value.indexOf('#');
    const base = fragmentIndex < 0 ? value : value.slice(0, fragmentIndex);
    const url = embedded.get(base);
    if (url) {
      expandedSize += url.length;
      assertExportSize(expandedSize);
      return url + (fragmentIndex < 0 ? '' : value.slice(fragmentIndex));
    }
    return value.startsWith('#') || value.startsWith('data:') ? value : null;
  };
  for (const root of collectWebSnapshotQueryRoots(document)) {
    for (const element of root.querySelectorAll('*')) {
      for (const name of ['src', 'href', 'poster', 'xlink:href']) {
        const value = element.getAttribute(name);
        if (!value) continue;
        const replacement = resolve(value);
        if (replacement) element.setAttribute(name, replacement);
        else element.removeAttribute(name);
      }
      const srcset = element.getAttribute('srcset');
      if (srcset) {
        element.setAttribute(
          'srcset',
          srcset.replace(/blob:[^\s,]+/gu, (url) => resolve(url) ?? '')
        );
      }
      const style = element.getAttribute('style');
      if (style) element.setAttribute('style', sanitizeWebSnapshotCssText(style, resolve));
      if (element.tagName.toLowerCase() === 'style') {
        element.textContent = sanitizeWebSnapshotStylesheetText(element.textContent ?? '', resolve);
      }
    }
  }
}

function normalizeHtmlSource(loaded: LoadedWebSnapshotPackage): string {
  if (!isWebSnapshotXhtml(loaded.html)) return loaded.html;
  const xhtml = sanitizeWebSnapshotXhtml(loaded.html, loaded.manifest.source.url, {
    allowedObjectUrls: loaded.assets.map((asset) => asset.url),
    offlineOnly: true,
    removeSvgAnimations: true,
  });
  const xml = new DOMParser().parseFromString(xhtml, 'application/xhtml+xml');
  const html = document.implementation.createHTMLDocument('');
  const element = html.importNode(xml.documentElement, true);
  const walker = html.createTreeWalker(element, NodeFilter.SHOW_CDATA_SECTION);
  const sections: Node[] = [];
  while (walker.nextNode()) sections.push(walker.currentNode);
  for (const section of sections) {
    section.parentNode?.replaceChild(html.createTextNode(section.textContent ?? ''), section);
  }
  html.replaceChild(element, html.documentElement);
  return html.documentElement.outerHTML;
}

/** Build a passive, standalone HTML artifact from the verified saved web copy. */
export async function createWebSnapshotHtmlExport(loaded: LoadedWebSnapshotPackage): Promise<{
  blob: Blob;
  filename: string;
}> {
  const embedded = await createEmbeddedAssets(loaded);
  const sanitized = sanitizeWebSnapshotHtml(
    normalizeHtmlSource(loaded),
    loaded.manifest.source.url,
    {
      allowedObjectUrls: loaded.assets.map((asset) => asset.url),
      offlineOnly: true,
      removeSvgAnimations: true,
    }
  );
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  rewriteDocument(document, embedded);
  document.querySelectorAll('meta[http-equiv], meta[charset]').forEach((meta) => meta.remove());
  const charset = document.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const policy = document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = EXPORT_CSP;
  document.head.prepend(charset, policy);
  document.title = loaded.manifest.source.title?.trim() || 'Web Snapshot';
  const captured = document.createElement('meta');
  captured.name = 'sniptale-captured-at';
  captured.content = loaded.manifest.capturedAt;
  document.head.append(captured);
  const source = document.createElement('meta');
  source.name = 'sniptale-source';
  source.content = loaded.manifest.source.url ?? '';
  document.head.append(source);
  const html = `<!doctype html>${document.documentElement.outerHTML}`;
  assertExportSize(html.length);
  return {
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
    filename: `${sanitizeWebSnapshotFilename(loaded.manifest.source.title ?? 'web-snapshot')}.html`,
  };
}
