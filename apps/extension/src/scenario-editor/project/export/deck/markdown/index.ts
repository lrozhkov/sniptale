import JSZip from 'jszip';
import type { ScenarioDeckExportInput, ScenarioDeckExportResult } from '../types';
import { resolveScenarioDeckExportAssets } from '../assets/resolve';
import { buildScenarioDeckPackageResult } from '../package-result';
import { renderScenarioDeckSlides } from '../render';
import { renderScenarioDeckMarkdownDocument } from './document';

export async function buildScenarioDeckMarkdownExport(
  input: ScenarioDeckExportInput
): Promise<ScenarioDeckExportResult> {
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

  const zip = new JSZip();
  zip.file('scenario.md', markdown);
  slides.forEach((rendered) => {
    zip.file(`slides/slide-${rendered.index + 1}.svg`, rendered.svg);
  });
  return buildScenarioDeckPackageResult({ assets, format: 'markdown', input, zip });
}
