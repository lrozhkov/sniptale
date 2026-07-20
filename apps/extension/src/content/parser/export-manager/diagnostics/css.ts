import type { ArchiveAsset } from '../archive';
import { buildComputedStyleDiagnosticAsset } from './css.computed-styles';
import { buildStylesheetDiagnosticAssets } from './css.stylesheets';
import type { ExportDiagnosticsSource } from './source';

/**
 * Builds stylesheet and computed-style diagnostics that complement DOM/HAR exports when
 * visual regressions need rule-level evidence.
 */
export function buildCssDiagnosticAssets(source?: ExportDiagnosticsSource): ArchiveAsset[] {
  return [...buildStylesheetDiagnosticAssets(source), buildComputedStyleDiagnosticAsset(source)];
}
