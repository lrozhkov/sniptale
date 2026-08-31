import type { ArchiveAsset } from '../export-manager/archive';
import { normalizePopupExportTabTitle } from '@sniptale/runtime-contracts/export';
import {
  normalizePagePackageOptionalUrl,
  normalizePagePackageWarnings,
} from '@sniptale/runtime-contracts/page-package';
import type { PagePackageScreenshotCoverage } from '@sniptale/runtime-contracts/page-package';
import { buildCssDiagnosticAssets } from '../export-manager/diagnostics/css';
import {
  buildDomSnapshotHtml,
  buildVirtualDomSnapshotHtml,
} from '../export-manager/diagnostics/snapshot';
import type { ExportDiagnosticsSource } from '../export-manager/diagnostics/source';
import { hashWebSnapshotAssetBlob } from '../../../features/web-snapshot/asset-manifest';
import { sanitizeWebSnapshotSourceUrl } from '../../../features/web-snapshot/public';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  composePagePackage,
  type ComposedPagePackage,
} from '../../../workflows/page-package/composer';
import { createDiagnosticContributions } from '../../../workflows/page-package/contributions/diagnostics';
import { createSafeWebCopyContributions } from '../../../workflows/page-package/contributions/web-copy';
import { addPagePackageReadme } from '../../../workflows/page-package/readme';
import {
  MAX_WEB_SNAPSHOT_ASSET_BYTES,
  MAX_WEB_SNAPSHOT_ASSETS_BYTES,
  MAX_WEB_SNAPSHOT_DIAGNOSTICS_BYTES,
  MAX_WEB_SNAPSHOT_HTML_BYTES,
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

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

function getTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertWithinByteLimit(label: string, size: number, maxSize: number): void {
  if (size > maxSize) throw new Error(`${label} is too large.`);
}

function getWarningsByteLength(warnings: readonly string[]): number {
  return warnings.reduce((total, warning) => total + getTextByteLength(warning), 0);
}

function getAssetsByteLength(assets: readonly WebSnapshotAssetEntry[]): number {
  return assets.reduce((total, asset) => total + asset.blob.size, 0);
}

function getArchiveAssetByteLength(asset: ArchiveAsset): number {
  return typeof asset.content === 'string' ? getTextByteLength(asset.content) : asset.content.size;
}

interface DomDiagnosticSnapshots {
  domSnapshot: string;
  virtualDomSnapshot: string;
}

function createDomDiagnosticSnapshots(args: {
  cssDiagnostics: readonly ArchiveAsset[];
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  warnings: readonly string[];
}): DomDiagnosticSnapshots {
  const domSnapshot = buildDomSnapshotHtml(args.diagnosticsSource);
  const virtualDomSnapshot = buildVirtualDomSnapshotHtml(args.diagnosticsSource);
  const supportingDiagnosticsBytes =
    getWarningsByteLength(args.warnings) +
    args.cssDiagnostics.reduce((total, asset) => total + getArchiveAssetByteLength(asset), 0);
  const diagnosticsBytes = getTextByteLength(domSnapshot) + getTextByteLength(virtualDomSnapshot);
  if (supportingDiagnosticsBytes + diagnosticsBytes <= MAX_WEB_SNAPSHOT_DIAGNOSTICS_BYTES) {
    return { domSnapshot, virtualDomSnapshot };
  }
  const reference = [
    '<!-- DOM diagnostic omitted to keep the Page Package within its diagnostics budget. -->',
    '<!-- Canonical static document: snapshot/index.html. -->',
  ].join('\n');
  return { domSnapshot: reference, virtualDomSnapshot: reference };
}

function createStandardDiagnostics(args: {
  cssDiagnostics: readonly ArchiveAsset[];
  domDiagnostics: DomDiagnosticSnapshots;
  warnings: readonly string[];
}): Array<{ content: string; path: string }> {
  const diagnostics = [
    { content: args.domDiagnostics.domSnapshot, path: 'dom.html' },
    { content: args.domDiagnostics.virtualDomSnapshot, path: 'virtual-dom.html' },
    { content: args.warnings.join('\n'), path: 'errors.log' },
  ];
  for (const asset of args.cssDiagnostics) {
    if (typeof asset.content !== 'string') {
      throw new Error(`Page Package diagnostic must contain text: ${asset.path}.`);
    }
    diagnostics.push({ content: asset.content, path: asset.path });
  }
  return diagnostics;
}

function assertPackageInputsWithinBudget(args: {
  assets: readonly WebSnapshotAssetEntry[];
  cssDiagnostics: readonly ArchiveAsset[];
  domDiagnostics: DomDiagnosticSnapshots;
  html: string;
  screenshotBlob: Blob;
  screenshotCoverage?: PagePackageScreenshotCoverage;
  thumbnailBlob: Blob;
  warnings: readonly string[];
}): void {
  const htmlBytes = getTextByteLength(args.html);
  const warningsBytes = getWarningsByteLength(args.warnings);
  const assetsBytes = getAssetsByteLength(args.assets);
  const diagnosticsBytes =
    getTextByteLength(args.domDiagnostics.domSnapshot) +
    getTextByteLength(args.domDiagnostics.virtualDomSnapshot) +
    warningsBytes +
    args.cssDiagnostics.reduce((total, asset) => total + getArchiveAssetByteLength(asset), 0);
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
    htmlBytes + diagnosticsBytes + assetsBytes + args.screenshotBlob.size + args.thumbnailBlob.size,
    MAX_WEB_SNAPSHOT_PACKAGE_INPUT_BYTES
  );
}

export async function buildWebSnapshotPackage(args: {
  assets: WebSnapshotAssetEntry[];
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  html: string;
  screenshotBlob: Blob;
  screenshotCoverage?: PagePackageScreenshotCoverage;
  source: WebSnapshotPageSource;
  warnings: string[];
  warningStats?: WebSnapshotWarningStats | undefined;
}): Promise<{
  manifest: ComposedPagePackage<Blob>['manifest'];
  pagePackage: ComposedPagePackage<Blob>;
  screenshotBlob: Blob;
  screenshotCoverage: PagePackageScreenshotCoverage;
  screenshotMimeType: 'image/png';
}> {
  const screenshotCoverage = args.screenshotCoverage ?? 'full-page';
  if (args.screenshotBlob.type !== 'image/png') {
    throw new Error('Page Package screenshot must use image/png.');
  }
  const warnings = normalizePagePackageWarnings(args.warnings);
  const cssDiagnostics = buildCssDiagnosticAssets(args.diagnosticsSource);
  const domDiagnostics = createDomDiagnosticSnapshots({
    cssDiagnostics,
    diagnosticsSource: args.diagnosticsSource,
    warnings,
  });
  const thumbnailBlob = await createImageThumbnailBlob(
    args.screenshotBlob,
    THUMBNAIL_WIDTH,
    THUMBNAIL_HEIGHT,
    { verticalAnchor: 'top' }
  );
  assertPackageInputsWithinBudget({
    ...args,
    cssDiagnostics,
    domDiagnostics,
    thumbnailBlob,
    warnings,
  });
  const [webCopy, diagnostics] = await Promise.all([
    createSafeWebCopyContributions(
      {
        assets: args.assets,
        html: args.html,
        screenshotBlob: args.screenshotBlob,
        screenshotCoverage,
        thumbnailBlob,
      },
      hashWebSnapshotAssetBlob
    ),
    createDiagnosticContributions({
      digest: hashWebSnapshotAssetBlob,
      intent: 'save',
      level: 'standard',
      standardAssets: createStandardDiagnostics({
        cssDiagnostics,
        domDiagnostics,
        warnings,
      }),
    }),
  ]);
  const failedResourceCount = args.warningStats?.failedAssetCount ?? 0;
  const source = {
    faviconUrl: null,
    title: args.source.title ? normalizePopupExportTabTitle(args.source.title) : null,
    url: normalizePagePackageOptionalUrl(sanitizeWebSnapshotSourceUrl(args.source.url)),
  };
  const contributions = await addPagePackageReadme({
    contributions: [...webCopy, ...diagnostics],
    diagnosticsLevel: 'standard',
    intent: 'save',
    source,
  });
  const pagePackage = await composePagePackage(
    {
      capturedAt: new Date().toISOString(),
      componentStatuses: {
        diagnostics: 'complete',
        webCopy:
          failedResourceCount > 0 || screenshotCoverage === 'viewport' ? 'partial' : 'complete',
      },
      contributions,
      diagnosticsLevel: 'standard',
      failedResourceCount,
      id: crypto.randomUUID(),
      intent: 'save',
      source,
      viewport: args.source.viewport ?? null,
      warnings,
    },
    (bytes) => {
      const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
      copy.set(bytes);
      return hashWebSnapshotAssetBlob(new Blob([copy]));
    }
  );
  return {
    manifest: pagePackage.manifest,
    pagePackage,
    screenshotBlob: args.screenshotBlob,
    screenshotCoverage,
    screenshotMimeType: 'image/png',
  };
}
