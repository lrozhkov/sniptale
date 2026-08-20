import { buildScenarioCaptureImageBlob } from './images';
import { createArchiveWriter, type ExportSink } from '../../../composition/archive-transfer';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioExportResult } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  type ScenarioAssetResolver,
  renderMarkdownCaptureStep,
  renderMarkdownStep,
  slugify,
} from './helpers';

export async function buildScenarioMarkdownExport(
  project: ScenarioProject,
  resolveAsset: ScenarioAssetResolver,
  imageFormat: ScenarioExportImageFormat,
  sink: ExportSink
): Promise<ScenarioExportResult & { size: number }> {
  let size = 0;
  const archive = createArchiveWriter(sink, {
    onBytesWritten(bytesWritten) {
      size = bytesWritten;
    },
  });
  const markdownParts: string[] = [`# ${project.name}`];
  try {
    for (const [index, step] of project.steps.entries()) {
      markdownParts.push(
        step.kind === 'capture'
          ? renderMarkdownCaptureStep(step, index, imageFormat)
          : renderMarkdownStep(step, index)
      );

      if (step.kind !== 'capture') continue;
      const asset = await resolveAsset(step.assetId);
      if (asset) {
        await archive.addBlob(
          `assets/step-${index + 1}.${imageFormat}`,
          await buildScenarioCaptureImageBlob(step, asset, imageFormat)
        );
      }
    }
    await archive.addText('scenario.md', markdownParts.filter(Boolean).join('\n\n'));
    await archive.close();
  } catch (error) {
    await archive.abort(error).catch(() => undefined);
    throw error;
  }
  return {
    blob: new Blob([], { type: 'application/zip' }),
    filename: createScenarioMarkdownArchiveFilename(project.name),
    format: 'markdown',
    size,
  };
}

export function createScenarioMarkdownArchiveFilename(projectName: string): string {
  return `${slugify(projectName)}-markdown.zip`;
}
