import type { ArchiveAsset } from '../archive';
import { buildComputedStyleDiagnosticAsset } from './css.computed-styles';
import { buildStylesheetDiagnosticAssets } from './css.stylesheets';
import type { ExportDiagnosticsSource } from './source';
import { buildFontDiagnosticAsset } from './css.fonts';

/**
 * Builds stylesheet and computed-style diagnostics that complement page diagnostics when
 * visual regressions need rule-level evidence.
 */
export function buildCssDiagnosticAssets(source?: ExportDiagnosticsSource): ArchiveAsset[] {
  return [
    ...buildStylesheetDiagnosticAssets(source),
    buildComputedStyleDiagnosticAsset(source),
    buildFontDiagnosticAsset(source),
  ];
}
