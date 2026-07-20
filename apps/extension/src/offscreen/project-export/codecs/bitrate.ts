import {
  VideoExportQualityPreset,
  VideoMp4Codec,
} from '../../../features/video/project/types/export';
import { EXPORT_BITRATES_BY_CODEC } from './constants';

export function scaleBitrate(
  quality: VideoExportQualityPreset,
  width: number,
  height: number,
  codec: VideoMp4Codec = VideoMp4Codec.AVC
): number {
  const bitrateByQuality =
    EXPORT_BITRATES_BY_CODEC[codec] ?? EXPORT_BITRATES_BY_CODEC[VideoMp4Codec.AVC];
  const base = bitrateByQuality[quality] ?? bitrateByQuality[VideoExportQualityPreset.BALANCED];
  const scale = Math.max(0.5, Math.min((width * height) / (1920 * 1080), 3));
  return Math.round(base * scale);
}
