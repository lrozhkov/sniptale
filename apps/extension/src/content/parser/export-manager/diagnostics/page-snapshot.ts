import type { ExportManagerPageMetadata } from '../../../platform/page-context/page-metadata';
import type { ExportDiagnosticsSource } from '../../../parser/export-manager/diagnostics/source';
import {
  buildDomSnapshotHtml as buildDomSnapshotHtmlFromDom,
  buildVirtualDomSnapshotHtml as buildVirtualDomSnapshotHtmlFromDom,
} from './page-snapshot.dom';
import {
  buildPageSummaryFile as buildPageSummaryFileFromPerformance,
  createHarLikeSnapshot as createHarLikeSnapshotFromPerformance,
} from './page-snapshot.performance';

export function buildDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  return buildDomSnapshotHtmlFromDom(source);
}

export function buildVirtualDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  return buildVirtualDomSnapshotHtmlFromDom(source);
}

export function buildPageSummaryFile(
  pageMetadata?: Partial<ExportManagerPageMetadata>,
  source?: ExportDiagnosticsSource
) {
  return buildPageSummaryFileFromPerformance(pageMetadata, source);
}

export function createHarLikeSnapshot(
  pageMetadata?: Partial<ExportManagerPageMetadata>,
  source?: ExportDiagnosticsSource
) {
  return createHarLikeSnapshotFromPerformance(pageMetadata, source);
}
