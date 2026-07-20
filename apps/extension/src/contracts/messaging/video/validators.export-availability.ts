import type {
  VideoExportCapabilities,
  VideoExportFormatCapability,
  VideoMp4CodecCapability,
} from '../../../features/video/project/types';
import { hasOptionalField, isBoolean, isRecord, isString } from '../validators/primitives';

function isVideoExportFormatCapability(value: unknown): value is VideoExportFormatCapability {
  return isRecord(value) && isString(value['format']) && isBoolean(value['available']);
}

function isVideoMp4CodecCapability(value: unknown): value is VideoMp4CodecCapability {
  return (
    isRecord(value) &&
    isString(value['codec']) &&
    isBoolean(value['available']) &&
    hasOptionalField(value, 'reason', isString)
  );
}

export function isVideoExportCapabilities(value: unknown): value is VideoExportCapabilities {
  return (
    isRecord(value) &&
    Array.isArray(value['formats']) &&
    value['formats'].every(isVideoExportFormatCapability) &&
    Array.isArray(value['mp4Codecs']) &&
    value['mp4Codecs'].every(isVideoMp4CodecCapability) &&
    (value['defaultMp4VideoCodec'] === null || isString(value['defaultMp4VideoCodec']))
  );
}
