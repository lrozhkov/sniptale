import { shouldSendFrameDrivenProgress } from '../shared/progress';
import type { RenderLoopJobState } from '../shared/types';
import { sendFrameDrivenProgress } from '../progress/frame-driven';

export async function maybeSendFrameDrivenProgress(args: {
  fps: number;
  frameIndex: number;
  job: RenderLoopJobState;
  lastProgressFrame: number;
  messageDetail?: string;
  totalFrames: number;
}): Promise<number> {
  const { fps, frameIndex, job, lastProgressFrame, messageDetail, totalFrames } = args;

  if (!shouldSendFrameDrivenProgress(frameIndex, lastProgressFrame, totalFrames, fps)) {
    return lastProgressFrame;
  }

  await sendFrameDrivenProgress(job.jobId, frameIndex, totalFrames, messageDetail);
  return frameIndex;
}
