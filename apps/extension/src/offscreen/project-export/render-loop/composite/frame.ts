import { renderProjectCompositionFrame } from '../../composition-joins';
import type { ProjectCompositionSceneInput } from '../../composition-scene';
import { syncClipPlayback } from '../../media';
import type { RenderLoopJobState } from '../shared/index';
import { sendCompositeRenderProgress } from '../progress/index';

type RenderCompositeFrameArgs = Omit<ProjectCompositionSceneInput, 'job' | 'clipMediaElements'> & {
  frameIndex: number;
  job: RenderLoopJobState;
  lastProgressSent: number;
  totalFrames: number;
};

export async function renderCompositeFrame(args: RenderCompositeFrameArgs): Promise<number | null> {
  const { currentTime, frameIndex, job, project, settings, signal } = args;

  if (job.cancelled || signal?.aborted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }

  syncClipPlayback(job, project, currentTime);
  await renderProjectCompositionFrame({ ...args, clipMediaElements: job.clipMediaElements });

  return sendCompositeRenderProgress({
    currentFrame: frameIndex + 1,
    totalFrames: args.totalFrames,
    format: settings.format,
    jobId: job.jobId,
    lastProgressSent: args.lastProgressSent,
  });
}
