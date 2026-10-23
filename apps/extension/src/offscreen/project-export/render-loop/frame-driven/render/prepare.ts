import { renderProjectCompositionFrame } from '../../../composition-joins';
import { syncVideoClipFrame } from '../../../media';
import type { RenderFrameDrivenCompositeFrameArgs } from './types';

export async function prepareFrameDrivenCompositeFrame(
  args: RenderFrameDrivenCompositeFrameArgs
): Promise<void> {
  const { currentTime, job, project, signal, throwIfPipelineFailed } = args;
  if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  throwIfPipelineFailed();
  await syncVideoClipFrame(job, project, currentTime, signal);
  await renderProjectCompositionFrame({
    ...args,
    ownerDocument: args.canvas.ownerDocument,
    clipMediaElements: job.clipMediaElements,
  });
}
