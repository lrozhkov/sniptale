import type { ArchiveAsset } from '../archive';
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
  return options.includeBasicLogs;
}

/**
 * Build the parser/runtime `logs/` bundle owned by the separate Basic Logs option.
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
  ];
}
