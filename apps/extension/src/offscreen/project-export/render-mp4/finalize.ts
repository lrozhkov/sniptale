import { getExportFormatDescriptor } from '../persistence';
import { sendProgress } from '../runtime';
import {
  VideoExportFormat,
  VideoProjectExportPhase,
} from '../../../features/video/project/types/export';
import { translate } from '../../../platform/i18n';
import type { createMp4Pipeline } from './pipeline/index';

export async function flushMp4Encoders(
  videoEncoder: VideoEncoder,
  audioEncoder: AudioEncoder | null
) {
  const flushPromises: Array<Promise<void>> = [videoEncoder.flush()];
  if (audioEncoder) {
    flushPromises.push(audioEncoder.flush());
  }
  await Promise.all(flushPromises);
}

export async function finalizeMp4Muxing(args: {
  jobId: string;
  pipeline: Awaited<ReturnType<typeof createMp4Pipeline>>;
  signal?: AbortSignal;
  throwIfPipelineFailed: () => void;
}) {
  await sendProgress(
    args.jobId,
    VideoProjectExportPhase.TRANSCODING,
    98,
    translate('offscreenExport.mp4FinalizingContainer')
  );
  if (args.signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  await args.pipeline.muxer.finalize();
  args.throwIfPipelineFailed();
  if (args.signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  if (!args.pipeline.target.buffer) throw new Error('MP4 output was not finalized');

  return new Blob([args.pipeline.target.buffer], {
    type: getExportFormatDescriptor(VideoExportFormat.MP4).mimeType,
  });
}
