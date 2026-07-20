import { buildScenarioDeckHtmlExport } from './html';
import { buildScenarioDeckMarkdownExport } from './markdown';
import type { ScenarioDeckExportInput, ScenarioDeckExportResult } from './types';

export { buildScenarioDeckHtmlExport } from './html';
export { buildScenarioDeckMarkdownExport } from './markdown';
export type {
  ScenarioDeckAssetMode,
  ScenarioDeckExportAsset,
  ScenarioDeckExportAssets,
  ScenarioDeckExportFormat,
  ScenarioDeckExportInput,
  ScenarioDeckExportOptions,
  ScenarioDeckExportResult,
  ScenarioDeckRenderedSlide,
} from './types';

/**
 * Builds a portable v3 scenario deck export from a pure project snapshot.
 * Asset retrieval is injected so UI/browser runtimes own storage and download side effects.
 */
export async function buildScenarioDeckExport(
  input: ScenarioDeckExportInput
): Promise<ScenarioDeckExportResult> {
  switch (input.options.format) {
    case 'html':
      return buildScenarioDeckHtmlExport(input);
    case 'markdown':
      return buildScenarioDeckMarkdownExport(input);
  }
}
