import {
  resolveVideoOutputDimensions,
  type VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

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
