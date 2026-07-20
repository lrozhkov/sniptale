import { VideoExportFormat } from '../../../features/video/project/types/export';
import { translate } from '../../../platform/i18n';

interface ExportFormatDescriptor {
  extension: 'webm' | 'mp4';
  labelKey: 'offscreenExport.formatWebmLabel' | 'offscreenExport.formatMp4Label';
  mimeType: string;
  label: string;
}

const EXPORT_FORMATS: Record<VideoExportFormat, ExportFormatDescriptor> = {
  [VideoExportFormat.WEBM]: {
    extension: 'webm',
    labelKey: 'offscreenExport.formatWebmLabel',
    mimeType: 'video/webm',
    label: '',
  },
  [VideoExportFormat.MP4]: {
    extension: 'mp4',
    labelKey: 'offscreenExport.formatMp4Label',
    mimeType: 'video/mp4',
    label: '',
  },
};

export function getExportFormatDescriptor(format: VideoExportFormat): ExportFormatDescriptor {
  const descriptor = EXPORT_FORMATS[format] ?? EXPORT_FORMATS[VideoExportFormat.WEBM];
  return {
    ...descriptor,
    label: translate(descriptor.labelKey),
  };
}
