import {
  hashWebSnapshotAssetBytes,
  normalizeWebSnapshotAssetMimeType,
} from '../../features/web-snapshot/asset-manifest';
import { sanitizeWebSnapshotCssText } from '../../features/web-snapshot/public';
import type {
  WebSnapshotAssetManifestEntry,
  WebSnapshotManifest,
} from '@sniptale/runtime-contracts/web-snapshot';

const MAX_VIEWER_TOTAL_ASSET_BYTES = 250 * 1024 * 1024;

function assertSafeManifestAssetPath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.') ||
    !/^assets\/[^/]+$/u.test(path)
  ) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }
}

function createAssetManifestByPath(
  manifest: WebSnapshotManifest
): Map<string, WebSnapshotAssetManifestEntry> | null {
  if (manifest.assets === undefined) {
    return null;
  }

  const entriesByPath = new Map<string, WebSnapshotAssetManifestEntry>();
  for (const entry of manifest.assets) {
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
  manifestEntry: WebSnapshotAssetManifestEntry | undefined
): Promise<void> {
  if (!manifestEntry) {
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

  if (manifestEntry.mimeType === 'image/svg+xml') {
    throw new Error('Web snapshot package SVG assets are not supported.');
  }
}

function createViewerAssetBlob(
  path: string,
  bytes: Uint8Array,
  manifestEntry?: WebSnapshotAssetManifestEntry
): Blob {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  const isCssAsset =
    manifestEntry?.mimeType === 'text/css' ||
    (!manifestEntry && path.toLowerCase().endsWith('.css'));
  if (isCssAsset) {
    const css = new TextDecoder().decode(copy);
    return new Blob([sanitizeWebSnapshotCssText(css)], { type: 'text/css' });
  }

  return new Blob([copy], { type: manifestEntry?.mimeType ?? '' });
}

export async function createViewerAssetObjectUrls(
  assetEntries: Array<[string, Uint8Array]>,
  packageManifest: WebSnapshotManifest
): Promise<{
  objectUrls: string[];
  urlsByPath: Map<string, string>;
}> {
  const objectUrls: string[] = [];
  const urlsByPath = new Map<string, string>();
  const manifestAssetsByPath = createAssetManifestByPath(packageManifest);
  if (manifestAssetsByPath && manifestAssetsByPath.size !== assetEntries.length) {
    throw new Error('Web snapshot package manifest asset metadata is invalid.');
  }

  try {
    let totalAssetBytes = 0;
    for (const [path, bytes] of assetEntries) {
      const manifestEntry = manifestAssetsByPath?.get(path);
      if (manifestAssetsByPath) {
        await assertViewerAssetMatchesManifest(bytes, manifestEntry);
      }

      const blob = createViewerAssetBlob(path, bytes, manifestEntry);
      totalAssetBytes += blob.size;
      if (totalAssetBytes > MAX_VIEWER_TOTAL_ASSET_BYTES) {
        throw new Error('Web snapshot package assets are too large.');
      }

      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      urlsByPath.set(path, objectUrl);
    }
  } catch (error) {
    for (const objectUrl of objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    throw error;
  }

  return { objectUrls, urlsByPath };
}
