import { resolvePreviewRasterSize } from '../../../../features/video/preview/raster';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorPreviewRasterPreset } from '../../../contracts/preview-runtime';

export interface VideoEditorPreviewRasterSize {
  height: number;
  width: number;
}

/** Resolves an author-aspect raster whose named preset is its target vertical resolution. */
export function resolveVideoEditorPreviewRasterSize(
  project: Pick<VideoProject, 'height' | 'width'>,
  preset: VideoEditorPreviewRasterPreset
): VideoEditorPreviewRasterSize {
  return resolvePreviewRasterSize(project, preset);
}
