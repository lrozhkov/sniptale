import { resolveVideoTargetBitrate } from '@sniptale/runtime-contracts/video/types/types';
import type {
  VideoMp4Codec,
  VideoProjectExportSettings,
  VideoWebmCodec,
} from '../../../features/video/project/types/export';

export function resolveExportTargetBitrate(
  settings: Pick<VideoProjectExportSettings, 'fps' | 'height' | 'quality' | 'resolution' | 'width'>,
  codec: VideoMp4Codec | VideoWebmCodec
): number {
  return resolveVideoTargetBitrate({
    codec,
    fps: settings.fps,
    height: settings.height,
    quality: settings.quality,
    resolution: settings.resolution,
    width: settings.width,
  });
}
