import {
  resolveVideoOutputDimensions,
  type VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

export interface CameraOutputViewport {
  width: number;
  height: number;
  resolution?: VideoResolutionPreset;
}

/** Shared export letterboxing and the existing one-pixel SOURCE crop. */
export function resolveProjectOutputTransform(
  project: { width: number; height: number },
  output: CameraOutputViewport
) {
  const crop =
    (output.resolution ?? 'SOURCE') === 'SOURCE' &&
    project.width >= output.width &&
    project.width - output.width <= 1 &&
    project.height >= output.height &&
    project.height - output.height <= 1;
  if (crop) return { offsetX: 0, offsetY: 0, scale: 1 };
  const scale = Math.min(output.width / project.width, output.height / project.height);
  return {
    offsetX: (output.width - project.width * scale) / 2,
    offsetY: (output.height - project.height * scale) / 2,
    scale,
  };
}

/** Fits the complete export scene inside the preset box without upscaling; codec dimensions stay even. */
export function resolveVideoExportDimensions(
  width: number,
  height: number,
  preset: VideoResolutionPreset
) {
  const source = resolveVideoOutputDimensions(width, height, 'SOURCE');
  if (preset === 'SOURCE') return source;
  const box = resolveVideoOutputDimensions(1920, 1080, preset);
  const scale = Math.min(1, box.width / width, box.height / height);
  return {
    width: Math.min(source.width, Math.max(2, Math.floor((width * scale) / 2) * 2)),
    height: Math.min(source.height, Math.max(2, Math.floor((height * scale) / 2) * 2)),
  };
}
