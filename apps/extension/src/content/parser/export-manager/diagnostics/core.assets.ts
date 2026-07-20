import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { type AccessibleIframeReadyResult } from '../../../platform/frame';
import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree, RootSelectionTrace } from '@sniptale/runtime-contracts/dom-tree';
import type { ArchiveAsset } from '../archive';
import { collectFieldDiagnostics, countRows } from './core.field-diagnostics';
import { buildCoreJsonAsset } from './core.json.ts';
import { resolveExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import { resolveOptionalDiagnosticsView, type ExportDiagnosticsSource } from './source';

export type CoreLogAssetsParams = {
  downloadedFilesCount: number;
  fileCandidatesCount: number;
  iframeReadiness: AccessibleIframeReadyResult;
  options: ExportOptions;
  diagnosticsSource?: ExportDiagnosticsSource | undefined;
  treeData: ParsedDOMTree;
  warnings: string[];
};

function buildMetaFile(params: CoreLogAssetsParams) {
  const pageMetadata = resolveExportManagerPageMetadata(params.treeData);
  const sourceView = resolveOptionalDiagnosticsView(params.diagnosticsSource);

  return {
    exportedAt: new Date().toISOString(),
    extensionVersion: runtimeInfo.getManifest().version,
    product: PRODUCT_BRAND_NAME,
    page: {
      title: pageMetadata.pageTitle,
      url: pageMetadata.pageUrl,
    },
    runtime: {
      language: sourceView?.navigator.language ?? 'unknown',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: sourceView?.navigator.userAgent ?? 'unknown',
      viewport: {
        width: sourceView?.innerWidth ?? null,
        height: sourceView?.innerHeight ?? null,
        devicePixelRatio: sourceView?.devicePixelRatio ?? null,
      },
    },
    exportOptions: params.options,
    pageProfile: params.treeData.meta?.profile,
  };
}

function buildParserReportFile(params: CoreLogAssetsParams) {
  const fieldDiagnostics = collectFieldDiagnostics(params.treeData);

  return {
    attachmentCandidates: params.fileCandidatesCount,
    downloadedAttachments: params.downloadedFilesCount,
    iframePreflight: {
      pendingIframes: params.iframeReadiness.pendingIframes.map(
        (iframe) => iframe.id || iframe.src || 'unknown'
      ),
      timedOut: params.iframeReadiness.timedOut,
      totalIframes: params.iframeReadiness.totalIframes,
    },
    parsing: {
      blocksCount: params.treeData.blocks?.length ?? 0,
      context: params.treeData.context,
      extractionClass: params.treeData.meta?.extractionClass ?? 'unknown',
      fieldsCount: fieldDiagnostics.fieldsCount,
      rowsCount: countRows(params.treeData),
      sectionsCount: params.treeData.structure.length,
      title: params.treeData.title,
    },
    qualitySignalsCount: params.treeData.meta?.qualitySignals?.length ?? 0,
    suspiciousOutput: {
      topDuplicateLabels: fieldDiagnostics.topDuplicateLabels,
      topLongestValues: fieldDiagnostics.topLongestValues,
    },
    warningsCount: params.warnings.length,
  };
}

export function buildMetaAsset(params: CoreLogAssetsParams): ArchiveAsset {
  return buildCoreJsonAsset('logs/meta.json', buildMetaFile(params));
}

export function buildParserReportAsset(params: CoreLogAssetsParams): ArchiveAsset {
  return buildCoreJsonAsset('logs/parser-report.json', buildParserReportFile(params));
}

export function buildProfileTraceAssets(treeData: ParsedDOMTree): ArchiveAsset[] {
  const pageProfile = treeData.meta?.profile;
  const pipelineTrace = treeData.meta?.pipelineTrace;
  const rootSelection = treeData.meta?.rootSelection;
  const pageMetadata = resolveExportManagerPageMetadata(treeData);

  return [
    buildCoreJsonAsset('logs/page-profile.json', pageProfile ?? null),
    buildCoreJsonAsset(
      'logs/detector-trace.json',
      treeData.meta?.detectorTrace ?? pageProfile?.matchedSignals ?? []
    ),
    buildRootSelectionAsset(rootSelection, pageProfile?.preferredRoots ?? [], pageMetadata.pageUrl),
    buildCoreJsonAsset('logs/pipeline-trace.json', {
      confidence: pageProfile?.confidence ?? 0,
      pageKind: pageProfile?.pageKind ?? 'unknown',
      parserNames: pipelineTrace?.parserNames ?? [],
      pipelineId: pageProfile?.pipelineId ?? 'unknown',
      registryId: pipelineTrace?.registryId ?? 'unknown',
      rootStrategy: pipelineTrace?.rootStrategy ?? 'virtual-root',
      vendor: pageProfile?.vendor ?? 'unknown',
    }),
    buildCoreJsonAsset('logs/payload-trace.json', treeData.meta?.payloadTrace ?? []),
  ];
}

function buildRootSelectionAsset(
  rootSelection: RootSelectionTrace | undefined,
  preferredRoots: string[],
  pageUrl: string
): ArchiveAsset {
  return buildCoreJsonAsset('logs/root-selection.json', {
    ...rootSelection,
    preferredRoots,
    url: pageUrl,
  });
}

export function buildExtractionSignalsAsset(treeData: ParsedDOMTree): ArchiveAsset {
  return buildCoreJsonAsset('logs/extraction-signals.json', {
    blocks: (treeData.blocks ?? []).map((block) => ({
      evidenceCount: block.evidence?.length ?? 0,
      id: block.id,
      kind: block.kind,
      sectionId: block.sectionId,
      tableRef: block.tableRef,
    })),
    extractionClass: treeData.meta?.extractionClass ?? 'unknown',
    qualitySignals: treeData.meta?.qualitySignals ?? [],
  });
}
