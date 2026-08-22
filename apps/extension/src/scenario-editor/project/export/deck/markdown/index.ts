import { createArchiveWriter } from '../../../../../composition/archive-transfer';
import type { ScenarioDeckExportInput, ScenarioDeckExportResult } from '../types';
import { resolveScenarioDeckExportAssets } from '../assets/resolve';
import { buildScenarioDeckPackageResult } from '../package-result';
import { renderScenarioDeckSlides } from '../render';
import { renderScenarioDeckMarkdownDocument } from './document';

export async function buildScenarioDeckMarkdownExport(
  input: ScenarioDeckExportInput
): Promise<ScenarioDeckExportResult> {
  if (!input.archiveSink) throw new Error('Scenario deck archive sink is required.');
  const archive = createArchiveWriter(input.archiveSink);
  try {
    const assets = await resolveScenarioDeckExportAssets({
      assetMode: 'files',
      getAssetBlob: input.getAssetBlob,
      project: input.project,
    });
    const slides = renderScenarioDeckSlides({ assets, project: input.project });
    const markdown = renderScenarioDeckMarkdownDocument({
      missingAssetIds: assets.missingAssetIds,
      options: { ...input.options, assetMode: 'files', format: 'markdown' },
      project: input.project,
      slides,
    });
    await archive.addText('scenario.md', markdown);
    for (const rendered of slides) {
      await archive.addText(`slides/slide-${rendered.index + 1}.svg`, rendered.svg);
    }
    return await buildScenarioDeckPackageResult({ archive, assets, format: 'markdown', input });
  } catch (error) {
    await archive.abort(error);
    throw error;
  }
}
