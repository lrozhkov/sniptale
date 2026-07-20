import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorPreviewRasterPreset } from '../../../contracts/preview-runtime';

export interface VideoEditorPreviewRasterSize {
  height: number;
  width: number;
}

const RASTER_HEIGHT_BY_PRESET: Record<VideoEditorPreviewRasterPreset, number> = {
  '360p': 360,
  '540p': 540,
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

const MAX_PREVIEW_RASTER_DIMENSION = 4096;
const MAX_PREVIEW_RASTER_PIXELS = 3840 * 2160;

function roundToEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function floorToEven(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function capPreviewRaster(width: number, height: number): VideoEditorPreviewRasterSize {
  const dimensionScale = Math.min(1, MAX_PREVIEW_RASTER_DIMENSION / Math.max(width, height));
  const pixelScale = Math.min(1, Math.sqrt(MAX_PREVIEW_RASTER_PIXELS / (width * height)));
  const scale = Math.min(dimensionScale, pixelScale);
  const quantize = scale < 1 ? floorToEven : roundToEven;
  return {
    height: quantize(height * scale),
    width: quantize(width * scale),
  };
}

/** Resolves an author-aspect raster whose named preset is its target vertical resolution. */
export function resolveVideoEditorPreviewRasterSize(
  project: Pick<VideoProject, 'height' | 'width'>,
  preset: VideoEditorPreviewRasterPreset
): VideoEditorPreviewRasterSize {
  const projectWidth = Math.max(1, project.width);
  const projectHeight = Math.max(1, project.height);
  const height = RASTER_HEIGHT_BY_PRESET[preset];
  return capPreviewRaster(roundToEven((projectWidth / projectHeight) * height), height);
}
