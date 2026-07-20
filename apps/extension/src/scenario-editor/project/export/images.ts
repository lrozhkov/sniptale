import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { loadImageFromBlob } from '@sniptale/platform/browser/media/image-load';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { buildScenarioCaptureSvgMarkup } from '../stage-render/svg';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioExportImageFormat } from '@sniptale/runtime-contracts/scenario/types/base';

const SCENARIO_EXPORT_PREVIEW_PNG_SCALE = 2;
const SCENARIO_EXPORT_FULL_IMAGE_PNG_SCALE = 4;

interface ScenarioCaptureImageRenderOptions {
  renderMode?: 'export' | 'original';
  scale?: number;
}

async function buildScenarioCaptureSvgBlob(
  step: ScenarioCaptureStep,
  asset: Blob,
  options: ScenarioCaptureImageRenderOptions = {}
): Promise<Blob> {
  const [assetDataUrl, assetDimensions] = await Promise.all([
    blobToDataUrl(asset),
    measureImageBlob(asset),
  ]);
  const svgMarkup = buildScenarioCaptureSvgMarkup({
    step,
    assetDataUrl,
    assetDimensions,
    renderMode: options.renderMode ?? 'export',
  });

  return new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
}

async function buildScenarioCapturePngBlob(
  step: ScenarioCaptureStep,
  asset: Blob,
  options: ScenarioCaptureImageRenderOptions = {}
): Promise<Blob> {
  const svgBlob = await buildScenarioCaptureSvgBlob(step, asset, options);
  const image = await loadImageFromBlob(svgBlob, 'Failed to load scenario export image');
  const canvas = document.createElement('canvas');
  const renderScale = options.scale ?? SCENARIO_EXPORT_PREVIEW_PNG_SCALE;
  canvas.width = SCENARIO_STAGE_WIDTH * renderScale;
  canvas.height = SCENARIO_STAGE_HEIGHT * renderScale;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create scenario export canvas');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to render scenario export PNG'));
        return;
      }

      resolve(blob);
    }, 'image/png');
  });
}

export async function buildScenarioCaptureImageBlob(
  step: ScenarioCaptureStep,
  asset: Blob,
  imageFormat: ScenarioExportImageFormat,
  options: ScenarioCaptureImageRenderOptions = {}
): Promise<Blob> {
  return imageFormat === 'png'
    ? buildScenarioCapturePngBlob(step, asset, options)
    : buildScenarioCaptureSvgBlob(step, asset, options);
}

export async function buildScenarioCaptureImageDataUrl(
  step: ScenarioCaptureStep,
  asset: Blob,
  imageFormat: ScenarioExportImageFormat,
  options: ScenarioCaptureImageRenderOptions = {}
): Promise<string> {
  return blobToDataUrl(await buildScenarioCaptureImageBlob(step, asset, imageFormat, options));
}

export const scenarioCaptureImageScales = {
  full: SCENARIO_EXPORT_FULL_IMAGE_PNG_SCALE,
  preview: SCENARIO_EXPORT_PREVIEW_PNG_SCALE,
} as const;
