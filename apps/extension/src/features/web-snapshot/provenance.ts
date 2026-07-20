import JSZip from 'jszip';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  assertZipEntryCanInflate,
  assertZipPackageInflationProfile,
} from '@sniptale/platform/data/zip-profile';
import {
  isWebSnapshotManifest,
  parseWebSnapshotManifestJson,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from './manifest';

const MAX_WEB_SNAPSHOT_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_PACKAGE_FILE_COUNT = 500;
const MAX_WEB_SNAPSHOT_PACKAGE_INFLATED_BYTES = 250 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_PACKAGE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_MANIFEST_BYTES = 1024 * 1024;

interface SanitizedWebSnapshotPackage {
  changed: boolean;
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  size: number;
}

interface WebSnapshotPackageProvenanceOptions {
  includeSourceMetadata?: boolean;
  maxPackageBytes?: number;
}

export function sanitizeWebSnapshotManifestProvenance(
  manifest: WebSnapshotManifest,
  options: WebSnapshotPackageProvenanceOptions = {}
): WebSnapshotManifest {
  if (options.includeSourceMetadata === false) {
    return {
      ...manifest,
      source: {
        ...manifest.source,
        faviconUrl: null,
        title: null,
        url: null,
      },
    };
  }

  return {
    ...manifest,
    source: {
      ...manifest.source,
      faviconUrl: sanitizeProvenanceUrl(manifest.source.faviconUrl),
      url: sanitizeProvenanceUrl(manifest.source.url),
    },
  };
}

export async function sanitizeWebSnapshotPackageProvenance(
  packageBlob: Blob,
  manifestOverride?: WebSnapshotManifest,
  options: WebSnapshotPackageProvenanceOptions = {}
): Promise<SanitizedWebSnapshotPackage> {
  const maxPackageBytes = options.maxPackageBytes ?? MAX_WEB_SNAPSHOT_PACKAGE_BYTES;
  assertWebSnapshotPackageBlobLimits(packageBlob, maxPackageBytes);
  const zip = await JSZip.loadAsync(await packageBlob.arrayBuffer());
  assertWebSnapshotInflatedProfile(zip);
  const packageManifest = await readWebSnapshotPackageManifest(zip);
  const outputManifest = sanitizeWebSnapshotManifestProvenance(
    manifestOverride ?? packageManifest,
    options
  );
  const packageOutputManifest = sanitizeWebSnapshotManifestProvenance(
    applyProvenanceOverride(packageManifest, manifestOverride),
    options
  );
  const normalizedPackageManifest = withPackageSize(packageOutputManifest, packageBlob.size);
  const normalizedOutputManifest = withPackageSize(outputManifest, packageBlob.size);
  const manifestChanged =
    JSON.stringify(packageManifest) !== JSON.stringify(normalizedPackageManifest);

  if (!manifestChanged) {
    return {
      changed: false,
      manifest: normalizedOutputManifest,
      packageBlob,
      size: packageBlob.size,
    };
  }

  const sanitizedPackage = await generatePackageWithManifest(
    zip,
    normalizedPackageManifest,
    maxPackageBytes
  );
  return {
    changed: true,
    manifest: withPackageSize(outputManifest, sanitizedPackage.packageBlob.size),
    packageBlob: sanitizedPackage.packageBlob,
    size: sanitizedPackage.packageBlob.size,
  };
}

function applyProvenanceOverride(
  packageManifest: WebSnapshotManifest,
  manifestOverride: WebSnapshotManifest | undefined
): WebSnapshotManifest {
  if (!manifestOverride) {
    return packageManifest;
  }

  return {
    ...packageManifest,
    source: {
      ...packageManifest.source,
      faviconUrl: manifestOverride.source.faviconUrl,
      url: manifestOverride.source.url,
    },
  };
}

function assertWebSnapshotPackageBlobLimits(packageBlob: Blob, maxPackageBytes: number): void {
  if (packageBlob.size > maxPackageBytes) {
    throw new Error('Web snapshot package is too large.');
  }
}

function assertWebSnapshotSafePath(path: string): void {
  const normalizedPath = path.replaceAll('\\', '/');
  const segments = normalizedPath.split('/');
  if (
    path !== normalizedPath ||
    normalizedPath.startsWith('/') ||
    segments.some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error('Web snapshot package contains an unsafe path.');
  }
}

function resolveWebSnapshotEntryMaxBytes(path: string): number {
  return path === WEB_SNAPSHOT_PACKAGE_PATHS.manifest
    ? MAX_WEB_SNAPSHOT_MANIFEST_BYTES
    : MAX_WEB_SNAPSHOT_PACKAGE_ENTRY_BYTES;
}

function assertWebSnapshotInflatedProfile(zip: JSZip): void {
  assertZipPackageInflationProfile(Object.values(zip.files), {
    assertPath: assertWebSnapshotSafePath,
    createEntryError: (path) =>
      new Error(
        path === WEB_SNAPSHOT_PACKAGE_PATHS.manifest
          ? 'Web snapshot package manifest is too large.'
          : 'Web snapshot package entry is too large.'
      ),
    createFileCountError: () => new Error('Web snapshot package has too many files.'),
    createTotalError: () => new Error('Web snapshot package inflated size is too large.'),
    maxFileCount: MAX_WEB_SNAPSHOT_PACKAGE_FILE_COUNT,
    maxTotalBytes: MAX_WEB_SNAPSHOT_PACKAGE_INFLATED_BYTES,
    resolveEntryMaxBytes: resolveWebSnapshotEntryMaxBytes,
  });
}

async function generatePackageWithManifest(
  zip: JSZip,
  manifest: WebSnapshotManifest,
  maxPackageBytes: number
): Promise<{ manifest: WebSnapshotManifest; packageBlob: Blob }> {
  let nextManifest = manifest;
  let packageBlob = await writeManifestAndGeneratePackage(zip, nextManifest, maxPackageBytes);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sizedManifest = withPackageSize(nextManifest, packageBlob.size);
    if (JSON.stringify(sizedManifest) === JSON.stringify(nextManifest)) {
      return { manifest: nextManifest, packageBlob };
    }

    nextManifest = sizedManifest;
    packageBlob = await writeManifestAndGeneratePackage(zip, nextManifest, maxPackageBytes);
  }

  throw new Error('Web snapshot package manifest size did not stabilize.');
}

async function writeManifestAndGeneratePackage(
  zip: JSZip,
  manifest: WebSnapshotManifest,
  maxPackageBytes: number
): Promise<Blob> {
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest, null, 2));
  const packageBlob = await zip.generateAsync({ type: 'blob' });
  assertWebSnapshotPackageBlobLimits(packageBlob, maxPackageBytes);
  return packageBlob;
}

function withPackageSize(manifest: WebSnapshotManifest, packageSize: number): WebSnapshotManifest {
  return {
    ...manifest,
    stats: {
      ...manifest.stats,
      packageSize,
    },
  };
}

async function readWebSnapshotPackageManifest(zip: JSZip): Promise<WebSnapshotManifest> {
  const manifestFile = zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest);
  if (!manifestFile) {
    throw new Error('Web snapshot package manifest is missing.');
  }

  assertZipEntryCanInflate(
    manifestFile,
    MAX_WEB_SNAPSHOT_MANIFEST_BYTES,
    () => new Error('Web snapshot package manifest is too large.')
  );
  const bytes = await manifestFile.async('uint8array');
  if (bytes.byteLength > MAX_WEB_SNAPSHOT_MANIFEST_BYTES) {
    throw new Error('Web snapshot package manifest is too large.');
  }

  const manifest = parseWebSnapshotManifestJson(new TextDecoder().decode(bytes));
  if (!isWebSnapshotManifest(manifest)) {
    throw new Error('Web snapshot package manifest is invalid.');
  }
  return manifest;
}
