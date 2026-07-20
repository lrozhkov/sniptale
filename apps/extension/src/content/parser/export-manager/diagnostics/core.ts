import type { ArchiveAsset } from '../archive';
import { sanitizeDiagnosticData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { getConsoleDiagnosticsSnapshot } from './console';
import { buildPageSummaryFile } from './snapshot';
import { buildCoreJsonAsset } from './core.json.ts';
import type { CoreLogAssetsParams } from './core.assets';
import {
  buildExtractionSignalsAsset,
  buildMetaAsset,
  buildParserReportAsset,
  buildProfileTraceAssets,
} from './core.assets';
import { resolveExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';

function shouldIncludeCoreLogs(options: CoreLogAssetsParams['options']): boolean {
  return options.includeBasicLogs || options.includeHarDomLogs || options.includeCssDiagnostics;
}

function buildConsoleDiagnosticsAsset(): ArchiveAsset {
  return {
    path: 'logs/console.json',
    content: JSON.stringify(sanitizeDiagnosticData(getConsoleDiagnosticsSnapshot()), null, 2),
  };
}

/**
 * Build the core `logs/` bundle used by both Basic logs and HAR + DOM.
 */
export function collectCoreLogAssets(params: CoreLogAssetsParams): ArchiveAsset[] {
  if (!shouldIncludeCoreLogs(params.options)) {
    return [];
  }

  return [
    buildMetaAsset(params),
    buildCoreJsonAsset(
      'logs/page-summary.json',
      buildPageSummaryFile(
        resolveExportManagerPageMetadata(params.treeData),
        params.diagnosticsSource
      )
    ),
    buildParserReportAsset(params),
    buildCoreJsonAsset('logs/parser-tree.json', params.treeData),
    buildExtractionSignalsAsset(params.treeData),
    ...buildProfileTraceAssets(params.treeData),
    buildConsoleDiagnosticsAsset(),
  ];
}
