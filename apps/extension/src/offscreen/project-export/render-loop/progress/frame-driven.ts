import { translate } from '../../../../platform/i18n';
import { VideoProjectExportPhase } from '../../../../features/video/project/types/export';
import { sendProgress } from '../../runtime';

export function sendFrameDrivenProgress(
  jobId: string,
  frameIndex: number,
  totalFrames: number,
  messageDetail?: string,
  range = { start: 0, end: 100 }
): Promise<void> {
  const messageParts: Array<string | number> = [
    translate('offscreenExport.frameDrivenRenderPrefix'),
    frameIndex + 1,
    translate('offscreenExport.progressFrameOf'),
    totalFrames,
  ];
  if (messageDetail) {
    messageParts.push(`(${messageDetail})`);
  }

  return sendProgress(
    jobId,
    VideoProjectExportPhase.RENDERING,
    range.start + ((frameIndex + 1) / totalFrames) * (range.end - range.start),
    messageParts.join(' ')
  );
}
