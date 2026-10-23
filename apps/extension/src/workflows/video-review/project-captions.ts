import type { VideoProject } from '../../features/video/project/types/model';
import { videoProjectCaptionInput } from '../../features/video/project/text/captions';
import { prepareReviewCaptions } from './render-captions';

type PreparedCaptions = Awaited<ReturnType<typeof prepareReviewCaptions>>;
type OutputSize = { width: number; height: number };

/** A preview session or export job owns this disposable completed-plan cache. */
export function createVideoProjectCaptionRenderer() {
  let completed:
    | { project: VideoProject; output: OutputSize; captions: PreparedCaptions }
    | undefined;
  let revision = 0;
  const pending = new Set<AbortController>();
  return {
    async prepare(project: VideoProject, output: OutputSize, signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (
        completed?.project === project &&
        completed.output.width === output.width &&
        completed.output.height === output.height
      )
        return completed.captions;
      const current = ++revision;
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      pending.add(controller);
      try {
        const captions = await prepareReviewCaptions({
          ...videoProjectCaptionInput(project),
          output,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        if (current === revision) completed = { project, output: { ...output }, captions };
        return captions;
      } finally {
        signal?.removeEventListener('abort', abort);
        pending.delete(controller);
      }
    },
    clear() {
      revision++;
      completed = undefined;
      for (const controller of pending) controller.abort();
      pending.clear();
    },
  };
}

/** Concrete rendering dependency shared by montage preview and export runtimes. */
export type VideoProjectCaptionRenderer = ReturnType<typeof createVideoProjectCaptionRenderer>;
