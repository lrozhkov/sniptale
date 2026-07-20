import type React from 'react';

import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorPreviewZoom } from '../../../contracts/preview-runtime';

const ZOOM_SCALE: Record<Exclude<VideoEditorPreviewZoom, 'fit'>, number> = {
  '75%': 0.75,
  '100%': 1,
};

export function resolvePreviewStageSizeStyle(
  project: Pick<VideoProject, 'height' | 'width'>,
  zoom: VideoEditorPreviewZoom
): React.CSSProperties {
  const width = Math.max(1, project.width);
  const height = Math.max(1, project.height);
  const aspectRatio = `${width} / ${height}`;
  if (zoom !== 'fit') {
    return {
      aspectRatio,
      flex: '0 0 auto',
      height: `${Math.max(1, height * ZOOM_SCALE[zoom])}px`,
      maxHeight: 'none',
      maxWidth: 'none',
      width: `${Math.max(1, width * ZOOM_SCALE[zoom])}px`,
    };
  }
  return {
    aspectRatio,
    flex: '0 0 auto',
    height: `min(100cqh, calc(100cqw * ${height / width}))`,
    maxHeight: '100%',
    maxWidth: '100%',
    width: `min(100cqw, calc(100cqh * ${width / height}))`,
  };
}
