import type { LoadedImagesMap } from '../renderer';
import { type VideoProjectExportSettings } from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';
import type { ExportJobState } from '../types';
import { encodeMp4AudioIfPresent } from './audio';
import { finalizeMp4Muxing, flushMp4Encoders } from './finalize';
import { runMp4HybridVideoPipeline } from './hybrid';
import type { createMp4Pipeline } from './pipeline/index';

export async function runMp4EncodingPipeline(args: {
  audioEncoder: AudioEncoder | null;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  job: ExportJobState;
  loadedImages: LoadedImagesMap;
  pipeline: Awaited<ReturnType<typeof createMp4Pipeline>>;
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
  throwIfPipelineFailed: () => void;
  videoEncoder: VideoEncoder;
}) {
  await runMp4HybridVideoPipeline(args);
  args.throwIfPipelineFailed();

  await encodeMp4AudioIfPresent({
    audioEncoder: args.audioEncoder,
    pipeline: args.pipeline,
    throwIfPipelineFailed: args.throwIfPipelineFailed,
    ...(args.signal === undefined ? {} : { signal: args.signal }),
  });
  args.throwIfPipelineFailed();

  await flushMp4Encoders(args.videoEncoder, args.audioEncoder);
  args.throwIfPipelineFailed();

  return finalizeMp4Muxing({
    jobId: args.job.jobId,
    pipeline: args.pipeline,
    throwIfPipelineFailed: args.throwIfPipelineFailed,
  });
}
