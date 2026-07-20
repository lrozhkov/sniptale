import { translate } from '../../../../platform/i18n';
import {
  VideoExportFormat,
  VideoProjectExportPhase,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import { sendProgress } from '../../runtime';

function formatRenderProgressMessage(
  actionLabel: string,
  currentFrame: number,
  totalFrames: number
): string {
  return `${actionLabel} ${currentFrame} ${translate('offscreenExport.progressFrameOf')} ${totalFrames}`;
}

function getRenderProgressActionLabel(format: VideoProjectExportSettings['format']): string {
  return format === VideoExportFormat.MP4
    ? translate('offscreenExport.renderEncodingAction')
    : translate('offscreenExport.renderFrameAction');
}

export async function sendCompositeRenderProgress(params: {
  currentFrame: number;
  totalFrames: number;
  format: VideoProjectExportSettings['format'];
  jobId: string;
  lastProgressSent: number;
}): Promise<number | null> {
  const now = performance.now();
  if (now - params.lastProgressSent <= 180) {
    return null;
  }

  const actionLabel = getRenderProgressActionLabel(params.format);

  await sendProgress(
    params.jobId,
    VideoProjectExportPhase.RENDERING,
    (params.currentFrame / params.totalFrames) * 100,
    formatRenderProgressMessage(actionLabel, params.currentFrame, params.totalFrames)
  );

  return now;
}
