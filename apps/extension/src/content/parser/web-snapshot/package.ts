import type JSZip from 'jszip';
import type { ArchiveAsset } from '../export-manager/archive';
import { buildCssDiagnosticAssets } from '../export-manager/diagnostics/css';
import type { ExportDiagnosticsSource } from '../export-manager/diagnostics/source';
import {
  hashWebSnapshotAssetBlob,
  normalizeWebSnapshotAssetMimeType,
} from '../../../features/web-snapshot/asset-manifest';
import {
  createWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../../features/web-snapshot/manifest';
import { sanitizeWebSnapshotSourceUrl } from '../../../features/web-snapshot/public';
import type { WebSnapshotAssetManifestEntry } from '@sniptale/runtime-contracts/web-snapshot';
import {
  MAX_WEB_SNAPSHOT_ASSET_BYTES,
  MAX_WEB_SNAPSHOT_ASSETS_BYTES,
  MAX_WEB_SNAPSHOT_DIAGNOSTICS_BYTES,
  MAX_WEB_SNAPSHOT_HTML_BYTES,
  MAX_WEB_SNAPSHOT_PACKAGE_BLOB_BYTES,
  MAX_WEB_SNAPSHOT_PACKAGE_INPUT_BYTES,
  MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES,
  MAX_WEB_SNAPSHOT_WARNINGS,
  MAX_WEB_SNAPSHOT_WARNINGS_BYTES,
} from './limits';
import type {
  WebSnapshotAssetEntry,
  WebSnapshotPageSource,
  WebSnapshotWarningStats,
} from './types';

function getTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertWithinByteLimit(label: string, size: number, maxSize: number): void {
  if (size > maxSize) {
    throw new Error(`${label} is too large.`);
  }
}

function getWarningsByteLength(warnings: string[]): number {
  return warnings.reduce((total, warning) => total + getTextByteLength(warning), 0);
}

function getAssetsByteLength(assets: WebSnapshotAssetEntry[]): number {
  return assets.reduce((total, asset) => total + asset.blob.size, 0);
}

function getArchiveAssetByteLength(asset: ArchiveAsset): number {
  return typeof asset.content === 'string' ? getTextByteLength(asset.content) : asset.content.size;
}

function getDiagnosticsByteLength(
  html: string,
  warnings: string[],
  cssDiagnostics: ArchiveAsset[]
) {
  return (
    getTextByteLength(html) * 2 +
    getWarningsByteLength(warnings) +
    cssDiagnostics.reduce((total, asset) => total + getArchiveAssetByteLength(asset), 0)
  );
}

function assertPackageInputsWithinBudget(args: {
  assets: WebSnapshotAssetEntry[];
  cssDiagnostics: ArchiveAsset[];
  html: string;
  screenshotBlob: Blob;
  warnings: string[];
}): void {
  const htmlBytes = getTextByteLength(args.html);
  const warningsBytes = getWarningsByteLength(args.warnings);
  const assetsBytes = getAssetsByteLength(args.assets);
  const diagnosticsBytes = getDiagnosticsByteLength(args.html, args.warnings, args.cssDiagnostics);
  assertWithinByteLimit('Web snapshot HTML', htmlBytes, MAX_WEB_SNAPSHOT_HTML_BYTES);
  assertWithinByteLimit('Web snapshot warnings', warningsBytes, MAX_WEB_SNAPSHOT_WARNINGS_BYTES);
  assertWithinByteLimit(
    'Web snapshot diagnostics',
    diagnosticsBytes,
    MAX_WEB_SNAPSHOT_DIAGNOSTICS_BYTES
  );
  assertWithinByteLimit('Web snapshot assets', assetsBytes, MAX_WEB_SNAPSHOT_ASSETS_BYTES);
  assertWithinByteLimit(
    'Web snapshot screenshot',
    args.screenshotBlob.size,
    MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES
  );
  if (args.warnings.length > MAX_WEB_SNAPSHOT_WARNINGS) {
    throw new Error('Web snapshot warnings are too large.');
  }
  for (const asset of args.assets) {
    assertWithinByteLimit('Web snapshot asset', asset.blob.size, MAX_WEB_SNAPSHOT_ASSET_BYTES);
  }
  assertWithinByteLimit(
    'Web snapshot package input',
    htmlBytes + diagnosticsBytes + assetsBytes + args.screenshotBlob.size,
    MAX_WEB_SNAPSHOT_PACKAGE_INPUT_BYTES
  );
}

function writeDiagnostics(
  zip: JSZip,
  html: string,
  warnings: string[],
  cssDiagnostics: ArchiveAsset[]
): void {
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.domSnapshot, html);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.virtualDomSnapshot, html);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.errors, warnings.join('\n'));

  for (const asset of cssDiagnostics) {
    zip.file(asset.path, asset.content);
  }
}

function writeManifest(zip: JSZip, manifest: ReturnType<typeof createWebSnapshotManifest>): void {
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest, JSON.stringify(manifest, null, 2));
}

function writePackageEntries(
  zip: JSZip,
  args: {
    assets: WebSnapshotAssetEntry[];
    cssDiagnostics: ArchiveAsset[];
    html: string;
    screenshotBlob: Blob;
    warnings: string[];
  }
): void {
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml, args.html);
  zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot, args.screenshotBlob);
  writeDiagnostics(zip, args.html, args.warnings, args.cssDiagnostics);

  for (const asset of args.assets) {
    zip.file(asset.localPath, asset.blob);
  }
}

async function createAssetManifestEntries(
  assets: WebSnapshotAssetEntry[]
): Promise<WebSnapshotAssetManifestEntry[]> {
  return Promise.all(
    assets.map(async (asset) => ({
      mimeType: normalizeWebSnapshotAssetMimeType(asset.blob.type),
      path: asset.localPath,
      sha256: await hashWebSnapshotAssetBlob(asset.blob),
      size: asset.blob.size,
    }))
  );
}

async function createPackageManifest(args: {
  assets: WebSnapshotAssetEntry[];
  source: WebSnapshotPageSource;
  warnings: string[];
  warningStats?: WebSnapshotWarningStats;
}) {
  return createWebSnapshotManifest({
    assets: await createAssetManifestEntries(args.assets),
    id: crypto.randomUUID(),
    source: {
      faviconUrl: null,
      title: args.source.title,
      url: sanitizeWebSnapshotSourceUrl(args.source.url),
    },
    stats: {
      assetCount: args.assets.length,
      failedAssetCount: args.warningStats?.failedAssetCount ?? 0,
      networkWarningCount: args.warningStats?.networkWarningCount ?? 0,
      sanitizerWarningCount: args.warningStats?.sanitizerWarningCount ?? 0,
      warningCount: args.warningStats?.warningCount ?? args.warnings.length,
    },
    ...(args.source.viewport === undefined ? {} : { viewport: args.source.viewport }),
    warnings: args.warnings,
  });
}

export async function buildWebSnapshotPackage(args: {
  assets: WebSnapshotAssetEntry[];
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  html: string;
  screenshotBlob: Blob;
  source: WebSnapshotPageSource;
  warnings: string[];
  warningStats?: WebSnapshotWarningStats;
}): Promise<{
  manifest: ReturnType<typeof createWebSnapshotManifest>;
  packageBlob: Blob;
  screenshotBlob: Blob;
  screenshotMimeType: string;
}> {
  const cssDiagnostics = buildCssDiagnosticAssets(args.diagnosticsSource);
  assertPackageInputsWithinBudget({ ...args, cssDiagnostics });
  const { default: JSZipCtor } = await import('jszip');
  const zip = new JSZipCtor();
  writePackageEntries(zip, { ...args, cssDiagnostics });
  const manifest = await createPackageManifest(args);
  writeManifest(zip, manifest);
  const outputBlob = await zip.generateAsync({ type: 'blob' });
  assertWithinByteLimit(
    'Web snapshot package archive',
    outputBlob.size,
    MAX_WEB_SNAPSHOT_PACKAGE_BLOB_BYTES
  );
  const persistedManifest = {
    ...manifest,
    stats: { ...manifest.stats, packageSize: outputBlob.size },
  };

  return {
    manifest: persistedManifest,
    packageBlob: outputBlob,
    screenshotBlob: args.screenshotBlob,
    screenshotMimeType: args.screenshotBlob.type || 'image/png',
  };
}
