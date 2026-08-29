import {
  hashWebSnapshotAssetBytes,
  normalizeWebSnapshotAssetMimeType,
} from '../../features/web-snapshot/asset-manifest';
import {
  appendWebSnapshotAssetFragment,
  resolveWebSnapshotLocalAssetReference,
  sanitizeWebSnapshotStylesheetText,
  sanitizeWebSnapshotSvgText,
} from '../../features/web-snapshot/public';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import {
  isPagePackageWebCopyAssetMimeType,
  type PagePackageEntry,
} from '@sniptale/runtime-contracts/page-package';

const MAX_VIEWER_TOTAL_ASSET_BYTES = 250 * 1024 * 1024;

export type LoadedWebSnapshotAsset = {
  downloadUrl: string | null;
  mimeType: string;
  path: string;
  size: number;
  url: string;
};

function createOriginalAssetBlob(bytes: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new Blob([copy], { type: mimeType });
}

function assertSafeManifestAssetPath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.') ||
    !path.startsWith('assets/')
  ) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }
}

function createAssetManifestByPath(manifest: WebSnapshotManifest): Map<string, PagePackageEntry> {
  const entriesByPath = new Map<string, PagePackageEntry>();
  for (const entry of manifest.entries.filter(
    (candidate) => candidate.component === 'webCopy' && candidate.path.startsWith('assets/')
  )) {
    assertSafeManifestAssetPath(entry.path);
    if (entriesByPath.has(entry.path)) {
      throw new Error('Web snapshot package manifest asset metadata is invalid.');
    }
    entriesByPath.set(entry.path, entry);
  }
  return entriesByPath;
}

async function assertViewerAssetMatchesManifest(
  bytes: Uint8Array,
  manifestEntry: PagePackageEntry | undefined
): Promise<void> {
  if (!manifestEntry) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }

  if (!isPagePackageWebCopyAssetMimeType(manifestEntry.mimeType)) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }

  if (
    manifestEntry.size !== bytes.byteLength ||
    (await hashWebSnapshotAssetBytes(bytes)) !== manifestEntry.sha256
  ) {
    throw new Error('Web snapshot package asset metadata does not match package content.');
  }

  if (normalizeWebSnapshotAssetMimeType(manifestEntry.mimeType) !== manifestEntry.mimeType) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }
}

function createViewerAssetBlob(
  path: string,
  bytes: Uint8Array,
  manifestEntry: PagePackageEntry | undefined,
  resolveAssetUrl: (reference: string, sourcePath: string) => string | null
): Blob {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  const isCssAsset =
    manifestEntry?.mimeType === 'text/css' ||
    (!manifestEntry && path.toLowerCase().endsWith('.css'));
  if (isCssAsset) {
    const css = new TextDecoder().decode(copy);
    return new Blob(
      [
        sanitizeWebSnapshotStylesheetText(css, (url) => {
          const trimmedUrl = url.trim();
          if (trimmedUrl.startsWith('#')) return trimmedUrl;
          return resolveAssetUrl(trimmedUrl, path);
        }),
      ],
      { type: 'text/css' }
    );
  }

  if (manifestEntry?.mimeType === 'image/svg+xml') {
    const svg = new TextDecoder().decode(copy);
    return new Blob([sanitizeWebSnapshotSvgText(svg)], {
      type: 'image/svg+xml',
    });
  }

  return new Blob([copy], { type: manifestEntry?.mimeType ?? '' });
}

export async function createViewerAssetObjectUrls(
  assetEntries: Array<[string, Uint8Array]>,
  packageManifest: WebSnapshotManifest
): Promise<{
  assets: LoadedWebSnapshotAsset[];
  objectUrls: string[];
  urlsByPath: Map<string, string>;
}> {
  const objectUrls: string[] = [];
  const downloadUrlsByPath = new Map<string, string>();
  const urlsByPath = new Map<string, string>();
  let assets: LoadedWebSnapshotAsset[] = [];
  const manifestAssetsByPath = createAssetManifestByPath(packageManifest);
  if (manifestAssetsByPath.size !== assetEntries.length) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }

  try {
    let totalAssetBytes = 0;
    const validatedEntries: Array<{
      bytes: Uint8Array;
      manifestEntry?: PagePackageEntry;
      path: string;
    }> = [];
    for (const [path, bytes] of assetEntries) {
      const manifestEntry = manifestAssetsByPath?.get(path);
      await assertViewerAssetMatchesManifest(bytes, manifestEntry);
      totalAssetBytes += bytes.byteLength;
      if (totalAssetBytes > MAX_VIEWER_TOTAL_ASSET_BYTES) {
        throw new Error('Web snapshot package assets are too large.');
      }
      validatedEntries.push({
        bytes,
        path,
        ...(manifestEntry === undefined ? {} : { manifestEntry }),
      });
    }

    const isCssEntry = (entry: (typeof validatedEntries)[number]) =>
      entry.manifestEntry?.mimeType === 'text/css';
    const cssEntriesByPath = new Map(
      validatedEntries.filter(isCssEntry).map((entry) => [entry.path, entry])
    );
    const assetPaths = new Set(validatedEntries.map((entry) => entry.path));
    const resolveMaterializedAssetUrl = (
      referenceValue: string,
      sourcePath: string,
      resolvePath: (path: string) => string | null
    ): string | null => {
      const reference = resolveWebSnapshotLocalAssetReference(
        referenceValue,
        sourcePath,
        assetPaths
      );
      if (!reference) return null;
      const objectUrl = resolvePath(reference.path);
      return objectUrl ? appendWebSnapshotAssetFragment(objectUrl, reference.fragment) : null;
    };
    for (const entry of validatedEntries) {
      const mimeType = entry.manifestEntry?.mimeType ?? 'application/octet-stream';
      const downloadEligible = entry.manifestEntry !== undefined;
      if (!downloadEligible) continue;
      const needsSeparateDownloadUrl =
        isCssEntry(entry) || entry.manifestEntry?.mimeType === 'image/svg+xml';
      if (!needsSeparateDownloadUrl) continue;
      const downloadUrl = URL.createObjectURL(createOriginalAssetBlob(entry.bytes, mimeType));
      objectUrls.push(downloadUrl);
      downloadUrlsByPath.set(entry.path, downloadUrl);
    }
    for (const entry of validatedEntries.filter((candidate) => !isCssEntry(candidate))) {
      const blob = createViewerAssetBlob(
        entry.path,
        entry.bytes,
        entry.manifestEntry,
        (referenceValue, sourcePath) =>
          resolveMaterializedAssetUrl(
            referenceValue,
            sourcePath,
            (assetPath) => urlsByPath.get(assetPath) ?? null
          )
      );
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      urlsByPath.set(entry.path, objectUrl);
      if (entry.manifestEntry !== undefined && !downloadUrlsByPath.has(entry.path)) {
        downloadUrlsByPath.set(entry.path, objectUrl);
      }
    }

    const creatingCssPaths = new Set<string>();
    const createCssObjectUrl = (path: string): string | null => {
      const existing = urlsByPath.get(path);
      if (existing) return existing;
      const entry = cssEntriesByPath.get(path);
      if (!entry || creatingCssPaths.has(path)) return null;
      creatingCssPaths.add(path);
      try {
        const blob = createViewerAssetBlob(
          entry.path,
          entry.bytes,
          entry.manifestEntry,
          (referenceValue, sourcePath) =>
            resolveMaterializedAssetUrl(referenceValue, sourcePath, (assetPath) =>
              cssEntriesByPath.has(assetPath)
                ? createCssObjectUrl(assetPath)
                : (urlsByPath.get(assetPath) ?? null)
            )
        );
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        urlsByPath.set(entry.path, objectUrl);
        return objectUrl;
      } finally {
        creatingCssPaths.delete(path);
      }
    };
    for (const path of cssEntriesByPath.keys()) {
      createCssObjectUrl(path);
    }
    assets = validatedEntries.map((entry) => ({
      downloadUrl: downloadUrlsByPath.get(entry.path) ?? null,
      mimeType: entry.manifestEntry?.mimeType ?? 'application/octet-stream',
      path: entry.path,
      size: entry.bytes.byteLength,
      url: urlsByPath.get(entry.path)!,
    }));
  } catch (error) {
    for (const objectUrl of objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    throw error;
  }

  return { assets, objectUrls, urlsByPath };
}
