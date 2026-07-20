import {
  VideoExportFormat,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types/export';
import { translate } from '../../../platform/i18n';
import { getExportFormatDescriptor } from './format';

export function isMimeTypeCompatibleWithFormat(
  mimeType: string,
  format: VideoExportFormat
): boolean {
  const normalized = mimeType.toLowerCase();
  if (format === VideoExportFormat.MP4) {
    return (
      normalized.includes('video/mp4') ||
      normalized.includes('audio/mp4') ||
      normalized.includes('application/mp4')
    );
  }

  return normalized.includes('video/webm') || normalized.includes('audio/webm');
}

export async function prepareOutputBlob(
  settings: VideoProjectExportSettings,
  inputBlob: Blob
): Promise<Blob> {
  if (isMimeTypeCompatibleWithFormat(inputBlob.type, settings.format)) {
    const descriptor = getExportFormatDescriptor(settings.format);
    if (inputBlob.type === descriptor.mimeType) {
      return inputBlob;
    }

    return new Blob([inputBlob], { type: descriptor.mimeType });
  }

  if (settings.format === VideoExportFormat.WEBM) {
    return inputBlob;
  }

  throw new Error(translate('offscreenExport.fastPathMp4OnlySourceAsset'));
}
