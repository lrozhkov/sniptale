import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import type { ArchiveAsset } from '../archive';
import { buildCssDiagnosticAssets } from './css';
import { collectCoreLogAssets } from './core';
import type { ExportDiagnosticsSource } from './source';
import { buildDomSnapshotHtml, buildVirtualDomSnapshotHtml } from './snapshot';
export {
  buildDomSnapshotHtml,
  createResourceTimingSnapshot,
  buildVirtualDomSnapshotHtml,
} from './snapshot';
export { collectCoreLogAssets };
export { buildIssuesAsset } from './core.assets';
export {
  buildExtendedDiagnosticArtifacts,
  type ExtendedDiagnosticArtifact,
  type ExtendedDiagnosticTextDigest,
} from './extended-evidence';

/**
 * Build page-owned DOM artifacts for popup export.
 */
export async function collectAdvancedLogAssets(
  options: ExportOptions,
  _treeData?: ParsedDOMTree,
  diagnosticsSource?: ExportDiagnosticsSource
): Promise<ArchiveAsset[]> {
  if (!options.includePageDiagnostics) {
    return [];
  }

  const assets: ArchiveAsset[] = [
    {
      path: 'logs/dom.html',
      content: buildDomSnapshotHtml(diagnosticsSource),
    },
    {
      path: 'logs/virtual-dom.html',
      content: buildVirtualDomSnapshotHtml(diagnosticsSource),
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
