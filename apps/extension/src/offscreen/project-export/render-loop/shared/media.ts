import type { RenderLoopJobState } from './types';

/** Pauses every clip media element before a render-loop pass starts. */
export async function pauseRenderLoopMediaElements(
  job: Pick<RenderLoopJobState, 'clipMediaElements'>
): Promise<void> {
  await Promise.all(
    Array.from(job.clipMediaElements.values()).map((element) => {
      element.pause();
      return Promise.resolve();
    })
  );
}
