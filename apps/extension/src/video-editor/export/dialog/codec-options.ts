import { translate } from '../../../platform/i18n';
import { VideoMp4Codec } from '../../../features/video/project/types';
import type {
  VideoExportCapabilities,
  VideoMp4Codec as VideoMp4CodecType,
} from '../../../features/video/project/types';

function getMp4CodecLabel(codec: VideoMp4CodecType): string {
  switch (codec) {
    case VideoMp4Codec.AVC:
      return translate('videoEditor.exportDialog.codecAvcLabel');
    case VideoMp4Codec.HEVC:
      return translate('videoEditor.exportDialog.codecHevcLabel');
    case VideoMp4Codec.VP9:
      return translate('videoEditor.exportDialog.codecVp9Label');
  }
}

export function getMp4CodecOptions(
  capabilities: VideoExportCapabilities,
  selected?: VideoMp4CodecType
) {
  return capabilities.mp4Codecs
    .filter((entry) => entry.available || entry.codec === selected)
    .map(({ codec }) => ({
      value: codec,
      label: getMp4CodecLabel(codec),
    }));
}
