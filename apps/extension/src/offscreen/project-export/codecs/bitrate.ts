import { resolveVideoTargetBitrate } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProjectExportSettings } from '../../../features/video/project/types/export';

export function resolveExportTargetBitrate(
  settings: Pick<VideoProjectExportSettings, 'fps' | 'height' | 'quality' | 'resolution' | 'width'>
): number {
  return resolveVideoTargetBitrate({
    fps: settings.fps,
    height: settings.height,
    quality: settings.quality,
    resolution: settings.resolution,
    width: settings.width,
  });
}
