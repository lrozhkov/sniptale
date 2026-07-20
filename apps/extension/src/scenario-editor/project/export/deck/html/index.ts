import JSZip from 'jszip';
import type { ScenarioDeckExportResult, ScenarioDeckExportInput } from '../types';
import { resolveScenarioDeckExportAssets } from '../assets/resolve';
import { createTextBlob, slugifyDeckExportName } from '../helpers';
import { buildScenarioDeckPackageResult } from '../package-result';
import { renderScenarioDeckSlides } from '../render';
import { renderScenarioDeckHtmlDocument } from './document';

export async function buildScenarioDeckHtmlExport(
  input: ScenarioDeckExportInput
): Promise<ScenarioDeckExportResult> {
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
  const filename = `${slugifyDeckExportName(input.project.name)}.html`;

  if (input.options.assetMode === 'embed') {
    return {
      blob: createTextBlob(html, 'text/html;charset=utf-8'),
      filename,
      format: 'html',
      missingAssetIds: assets.missingAssetIds,
    };
  }

  const zip = new JSZip();
  zip.file('index.html', html);
  return buildScenarioDeckPackageResult({ assets, format: 'html', input, zip });
}
