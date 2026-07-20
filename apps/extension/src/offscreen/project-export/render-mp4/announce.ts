import { translate } from '../../../platform/i18n';
import { VideoProjectExportPhase } from '../../../features/video/project/types';
import { sendProgress } from '../runtime';

function formatMuxerInitMessage(fallbackNotes: string[]): string {
  if (fallbackNotes.length === 0) {
    return translate('offscreenExport.mp4MuxerInitializing');
  }

  const prefix = translate('offscreenExport.mp4MuxerInitializingWithFallbackPrefix');
  const suffix = translate('offscreenExport.mp4MuxerInitializingWithFallbackSuffix');
  return `${prefix}${fallbackNotes.join(' + ')}${suffix}`;
}

export function announceMp4PipelineStart(jobId: string, fallbackNotes: string[]) {
  return sendProgress(
    jobId,
    VideoProjectExportPhase.TRANSCODING,
    0,
    formatMuxerInitMessage(fallbackNotes)
  );
}

export { formatMuxerInitMessage };
