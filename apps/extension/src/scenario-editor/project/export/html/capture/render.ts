import type { ScenarioCaptureStep } from '../../../../../features/scenario/contracts/types/project';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';
import { type ScenarioAssetResolver, escapeHtml, resolveStepHeading } from '../../helpers';
import { buildScenarioCaptureImageDataUrl, scenarioCaptureImageScales } from '../../images';
import { renderScenarioTextBodyHtml, type ScenarioHtmlSectionRender } from '../fragments';
import { renderMissingCaptureStepHtml } from './missing';
import { renderCaptureLightboxHtml, renderCaptureSectionHtml } from './media';

export async function renderCaptureStepHtml(args: {
  captureIndex: number;
  imageFormat: ScenarioExportImageFormat;
  includeFullImages: boolean;
  resolveAsset: ScenarioAssetResolver;
  step: ScenarioCaptureStep;
}): Promise<ScenarioHtmlSectionRender> {
  const asset = await args.resolveAsset(args.step.assetId);
  const heading = escapeHtml(resolveStepHeading(args.step, args.captureIndex - 1));
  const body = renderScenarioTextBodyHtml(args.step.body, 'step-body');
  const lightboxId = `sniptale-full-image-${args.captureIndex}`;

  if (!asset) {
    return renderMissingCaptureStepHtml(heading, body, args.captureIndex);
  }

  const previewDataUrl = await buildScenarioCaptureImageDataUrl(args.step, asset, args.imageFormat);
  const shouldIncludeFullImages = args.includeFullImages && args.imageFormat === 'png';
  const fullImageDataUrl = shouldIncludeFullImages
    ? await buildScenarioCaptureImageDataUrl(args.step, asset, 'png', {
        renderMode: 'original',
        scale: scenarioCaptureImageScales.full,
      })
    : null;
  const lightboxHtml = fullImageDataUrl
    ? renderCaptureLightboxHtml(heading, lightboxId, fullImageDataUrl)
    : undefined;

  return {
    ...(lightboxHtml === undefined ? {} : { lightboxHtml }),
    sectionHtml: renderCaptureSectionHtml({
      body,
      captureIndex: args.captureIndex,
      fullImageDataUrl,
      heading,
      lightboxId,
      previewDataUrl,
    }),
  };
}
