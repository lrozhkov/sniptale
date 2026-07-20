import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import {
  sanitizeDiagnosticExportData,
  sanitizeRawDiagnosticExportData,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ArchiveAsset } from '../archive';
import { buildCssDiagnosticAssets } from './css';
import { collectCoreLogAssets } from './core';
import type { ExportHarCaptureResult } from './transport';
import { resolveExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import type { ExportDiagnosticsSource } from './source';
import {
  buildDomSnapshotHtml,
  createHarLikeSnapshot,
  buildVirtualDomSnapshotHtml,
} from './snapshot';
export {
  buildDomSnapshotHtml,
  createHarLikeSnapshot,
  buildVirtualDomSnapshotHtml,
} from './snapshot';
export { collectCoreLogAssets };
export { startExportHarCapture, stopExportHarCapture } from './transport';
export { captureFullPageScreenshotAsset } from './screenshot-transport';
export type { ExportHarCaptureHandle, ExportHarCaptureResult } from './transport';

function stringifyDiagnosticExportPayload(value: unknown, rawDiagnosticsEnabled: boolean): string {
  const payload = rawDiagnosticsEnabled
    ? sanitizeRawDiagnosticExportData(value)
    : sanitizeDiagnosticExportData(value);
  return JSON.stringify(payload, null, 2);
}

/**
 * Build advanced HAR + DOM artifacts for popup export.
 */
export async function collectAdvancedLogAssets(
  options: ExportOptions,
  sessionHar: ExportHarCaptureResult | null,
  treeData?: ParsedDOMTree,
  diagnosticsSource?: ExportDiagnosticsSource
): Promise<ArchiveAsset[]> {
  if (!options.includeHarDomLogs) {
    return [];
  }

  const pageMetadata = resolveExportManagerPageMetadata(treeData);

  const assets: ArchiveAsset[] = [
    {
      path: 'logs/dom.html',
      content: buildDomSnapshotHtml(diagnosticsSource),
    },
    {
      path: 'logs/virtual-dom.html',
      content: buildVirtualDomSnapshotHtml(diagnosticsSource),
    },
    {
      path: 'logs/resource-timing.har.json',
      content: stringifyDiagnosticExportPayload(
        createHarLikeSnapshot(pageMetadata, diagnosticsSource),
        sessionHar?.rawDiagnosticsEnabled ?? false
      ),
    },
  ];

  if (sessionHar) {
    assets.push({
      path: 'logs/session.har',
      content: stringifyDiagnosticExportPayload(sessionHar.har, sessionHar.rawDiagnosticsEnabled),
    });
  }

  return assets;
}

/**
 * Build stylesheet and computed-style artifacts for CSS-focused diagnostics.
 */
export function collectCssDiagnosticAssets(
  options: ExportOptions,
  diagnosticsSource?: ExportDiagnosticsSource
): ArchiveAsset[] {
  if (!options.includeCssDiagnostics) {
    return [];
  }

  return buildCssDiagnosticAssets(diagnosticsSource);
}
