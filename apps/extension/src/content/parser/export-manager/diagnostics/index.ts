import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { sanitizeDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { ArchiveAsset } from '../archive';
import { buildCssDiagnosticAssets } from './css';
import { collectCoreLogAssets } from './core';
import { resolveExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import type { ExportDiagnosticsSource } from './source';
import {
  buildDomSnapshotHtml,
  createResourceTimingSnapshot,
  buildVirtualDomSnapshotHtml,
} from './snapshot';
export {
  buildDomSnapshotHtml,
  createResourceTimingSnapshot,
  buildVirtualDomSnapshotHtml,
} from './snapshot';
export { collectCoreLogAssets };

function stringifyDiagnosticExportPayload(value: unknown): string {
  return JSON.stringify(sanitizeDiagnosticExportData(value), null, 2);
}

/**
 * Build page-owned DOM and Resource Timing artifacts for popup export.
 */
export async function collectAdvancedLogAssets(
  options: ExportOptions,
  treeData?: ParsedDOMTree,
  diagnosticsSource?: ExportDiagnosticsSource
): Promise<ArchiveAsset[]> {
  if (!options.includePageDiagnostics) {
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
      path: 'logs/resource-timing.json',
      content: stringifyDiagnosticExportPayload(
        createResourceTimingSnapshot(pageMetadata, diagnosticsSource)
      ),
    },
  ];

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
