import { createArchiveWriter } from '../../../../../composition/archive-transfer';
import type { ScenarioDeckExportResult, ScenarioDeckExportInput } from '../types';
import { resolveScenarioDeckExportAssets } from '../assets/resolve';
import { createTextBlob, slugifyDeckExportName } from '../helpers';
import { buildScenarioDeckPackageResult } from '../package-result';
import { renderScenarioDeckSlides } from '../render';
import { renderScenarioDeckHtmlDocument } from './document';

export async function buildScenarioDeckHtmlExport(
  input: ScenarioDeckExportInput
): Promise<ScenarioDeckExportResult> {
  const filename = `${slugifyDeckExportName(input.project.name)}.html`;

  if (input.options.assetMode === 'embed') {
    const assets = await resolveScenarioDeckExportAssets({
      assetMode: input.options.assetMode,
      getAssetBlob: input.getAssetBlob,
      project: input.project,
    });
    const html = renderScenarioDeckHtmlDocument({
      missingAssetIds: assets.missingAssetIds,
      options: input.options,
      project: input.project,
      slides: renderScenarioDeckSlides({ assets, project: input.project }),
    });
    return {
      blob: createTextBlob(html, 'text/html;charset=utf-8'),
      filename,
      format: 'html',
      missingAssetIds: assets.missingAssetIds,
    };
  }

  if (!input.archiveSink) throw new Error('Scenario deck archive sink is required.');
  const archive = createArchiveWriter(input.archiveSink);
  try {
    const assets = await resolveScenarioDeckExportAssets({
      assetMode: 'files',
      getAssetBlob: input.getAssetBlob,
      project: input.project,
    });
    const html = renderScenarioDeckHtmlDocument({
      missingAssetIds: assets.missingAssetIds,
      options: input.options,
      project: input.project,
      slides: renderScenarioDeckSlides({ assets, project: input.project }),
    });
    await archive.addText('index.html', html);
    return await buildScenarioDeckPackageResult({ archive, assets, format: 'html', input });
  } catch (error) {
    await archive.abort(error);
    throw error;
  }
}
