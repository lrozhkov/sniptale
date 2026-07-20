import JSZip from 'jszip';

import { buildScenarioCaptureImageBlob } from './images';
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
  imageFormat: ScenarioExportImageFormat = 'png'
): Promise<ScenarioExportResult> {
  const zip = new JSZip();
  const markdownParts: string[] = [`# ${project.name}`];

  for (const [index, step] of project.steps.entries()) {
    markdownParts.push(
      step.kind === 'capture'
        ? renderMarkdownCaptureStep(step, index, imageFormat)
        : renderMarkdownStep(step, index)
    );

    if (step.kind !== 'capture') {
      continue;
    }

    const asset = await resolveAsset(step.assetId);
    if (asset) {
      zip.file(
        `assets/step-${index + 1}.${imageFormat}`,
        await buildScenarioCaptureImageBlob(step, asset, imageFormat)
      );
    }
  }

  zip.file('scenario.md', markdownParts.filter(Boolean).join('\n\n'));

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${slugify(project.name)}-markdown.zip`,
    format: 'markdown',
  };
}
