import type JSZip from 'jszip';
import type { ScenarioDeckExportInput, ScenarioDeckExportResult } from './types';
import { addScenarioDeckAssetFiles } from './assets/package';
import type { resolveScenarioDeckExportAssets } from './assets/resolve';
import { slugifyDeckExportName } from './helpers';

type ScenarioDeckExportAssets = Awaited<ReturnType<typeof resolveScenarioDeckExportAssets>>;

export async function buildScenarioDeckPackageResult(args: {
  assets: ScenarioDeckExportAssets;
  format: 'html' | 'markdown';
  input: ScenarioDeckExportInput;
  zip: JSZip;
}): Promise<ScenarioDeckExportResult> {
  await addScenarioDeckAssetFiles(args.zip, args.assets);
  if (args.input.options.includeSourceJson) {
    args.zip.file('scenario.json', JSON.stringify(args.input.project, null, 2));
  }

  return {
    blob: await args.zip.generateAsync({ type: 'blob' }),
    filename: `${slugifyDeckExportName(args.input.project.name)}-${args.format}.zip`,
    format: args.format,
    missingAssetIds: args.assets.missingAssetIds,
  };
}
