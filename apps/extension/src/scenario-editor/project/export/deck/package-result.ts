import type { ArchiveWriter } from '../../../../composition/archive-transfer';
import type { ScenarioDeckExportInput, ScenarioDeckExportResult } from './types';
import { addScenarioDeckAssetFiles } from './assets/package';
import type { resolveScenarioDeckExportAssets } from './assets/resolve';
import { slugifyDeckExportName } from './helpers';

type ScenarioDeckExportAssets = Awaited<ReturnType<typeof resolveScenarioDeckExportAssets>>;

export function createScenarioDeckArchiveFilename(
  projectName: string,
  format: 'html' | 'markdown'
): string {
  return `${slugifyDeckExportName(projectName)}-${format}.zip`;
}

export async function buildScenarioDeckPackageResult(args: {
  assets: ScenarioDeckExportAssets;
  archive: ArchiveWriter;
  format: 'html' | 'markdown';
  input: ScenarioDeckExportInput;
}): Promise<ScenarioDeckExportResult> {
  await addScenarioDeckAssetFiles(args.archive, args.assets);
  if (args.input.options.includeSourceJson) {
    await args.archive.addText('scenario.json', JSON.stringify(args.input.project, null, 2));
  }
  await args.archive.close();

  return {
    blob: null,
    filename: createScenarioDeckArchiveFilename(args.input.project.name, args.format),
    format: args.format,
    missingAssetIds: args.assets.missingAssetIds,
  };
}
