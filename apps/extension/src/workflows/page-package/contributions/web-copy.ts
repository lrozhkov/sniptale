import {
  isPagePackageEntryPath,
  MAX_PAGE_PACKAGE_ENTRIES,
} from '@sniptale/runtime-contracts/page-package';
import { createArchivePathAllocator } from '../../../composition/archive-transfer/path';
import { isAllowedWebSnapshotAssetMimeType } from '../../../features/web-snapshot/public';
import type { PagePackageContribution } from '../paths';
import {
  createBlobContribution,
  normalizeContributionMimeType,
  type PagePackageBlobDigest,
} from './blob';

interface SafeWebCopyAsset {
  blob: Blob;
  localPath: string;
  originalUrl: string;
}

interface SafeWebCopyArtifacts {
  assets: readonly SafeWebCopyAsset[];
  html: string;
  screenshotBlob: Blob;
  thumbnailBlob: Blob;
}

function assertRequiredImageMime(blob: Blob, required: string, label: string): void {
  if (normalizeContributionMimeType(blob.type) !== required) {
    throw new Error(`${label} must use ${required}.`);
  }
}

const WEB_COPY_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'text/css': 'css',
};

function hasCanonicalAssetExtension(path: string, mimeType: string): boolean {
  const extension = WEB_COPY_EXTENSION_BY_MIME[mimeType];
  return extension !== undefined && path.toLocaleLowerCase('en-US').endsWith(`.${extension}`);
}

function assertAssetPaths(assets: readonly SafeWebCopyAsset[]): void {
  const collisionKeys = new Set(['snapshot/index.html', 'page-screenshot.png', 'thumbnail.webp']);
  const allocator = createArchivePathAllocator();
  for (const asset of assets) {
    const mimeType = normalizeContributionMimeType(asset.blob.type);
    if (
      !isAllowedWebSnapshotAssetMimeType(mimeType) ||
      !hasCanonicalAssetExtension(asset.localPath, mimeType) ||
      !isPagePackageEntryPath('webCopy', asset.localPath, mimeType)
    ) {
      throw new Error(`Invalid safe Web-copy asset path or MIME: ${asset.localPath}.`);
    }
    const collisionKey = asset.localPath.toLocaleLowerCase('en-US');
    if (collisionKeys.has(collisionKey)) {
      throw new Error(`Duplicate safe Web-copy asset path: ${asset.localPath}.`);
    }
    collisionKeys.add(collisionKey);
    const allocatedPath = allocator.reserve(asset.localPath.split('/'));
    if (allocatedPath !== asset.localPath) {
      throw new Error(`Safe Web-copy asset path requires renaming: ${asset.localPath}.`);
    }
  }
}

export async function createSafeWebCopyContributions(
  artifacts: SafeWebCopyArtifacts,
  digest: PagePackageBlobDigest
): Promise<PagePackageContribution<Blob>[]> {
  if (artifacts.assets.length > MAX_PAGE_PACKAGE_ENTRIES - 3) {
    throw new Error('Safe Web-copy asset count exceeds the Page Package limit.');
  }
  assertRequiredImageMime(artifacts.screenshotBlob, 'image/png', 'Page screenshot');
  assertRequiredImageMime(artifacts.thumbnailBlob, 'image/webp', 'Page thumbnail');
  assertAssetPaths(artifacts.assets);
  const required = [
    {
      blob: new Blob([artifacts.html], { type: 'text/html' }),
      mimeType: 'text/html',
      path: 'snapshot/index.html',
    },
    {
      blob: artifacts.screenshotBlob,
      mimeType: 'image/png',
      path: 'page-screenshot.png',
    },
    {
      blob: artifacts.thumbnailBlob,
      mimeType: 'image/webp',
      path: 'thumbnail.webp',
    },
  ] as const;
  const contributions: PagePackageContribution<Blob>[] = [];
  for (const entry of required) {
    contributions.push(await createBlobContribution({ ...entry, component: 'webCopy', digest }));
  }
  for (const asset of artifacts.assets) {
    contributions.push(
      await createBlobContribution({
        blob: asset.blob,
        component: 'webCopy',
        digest,
        mimeType: normalizeContributionMimeType(asset.blob.type),
        path: asset.localPath,
      })
    );
  }
  return contributions;
}
