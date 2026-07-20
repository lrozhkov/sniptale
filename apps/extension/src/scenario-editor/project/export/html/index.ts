import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioExportResult } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioProject } from '../../../../features/scenario/contracts/types/project';
import { type ScenarioAssetResolver, slugify } from '../helpers';
import { renderCaptureStepHtml } from './capture/render';
import { buildScenarioHtmlDocument } from './template';
import { renderTextStepHtml } from './text';

export async function buildScenarioHtmlExport(
  project: ScenarioProject,
  resolveAsset: ScenarioAssetResolver,
  imageFormat: ScenarioExportImageFormat = 'png',
  includeFullImages = false
): Promise<ScenarioExportResult> {
  let captureCount = 0;
  const renderedSections = await Promise.all(
    project.steps.map(async (step, index) =>
      step.kind === 'capture'
        ? renderCaptureStepHtml({
            captureIndex: ++captureCount,
            imageFormat,
            includeFullImages,
            resolveAsset,
            step,
          })
        : renderTextStepHtml(step, index)
    )
  );
  const sections = renderedSections.map((entry) => entry.sectionHtml);
  const lightboxes = renderedSections.flatMap((entry) =>
    entry.lightboxHtml ? [entry.lightboxHtml] : []
  );

  return {
    blob: new Blob([buildScenarioHtmlDocument(project, sections, lightboxes)], {
      type: 'text/html;charset=utf-8',
    }),
    filename: `${slugify(project.name)}.html`,
    format: 'html',
  };
}
