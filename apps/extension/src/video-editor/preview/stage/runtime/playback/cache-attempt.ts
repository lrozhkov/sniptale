import {
  VideoEditorPreviewMode,
  type VideoEditorPreviewPrepareOutcome,
  type VideoEditorPreviewPrepareRequest,
} from '../../../../contracts/preview-runtime';
import { buildVideoPreviewCache } from '../../../../preview/cache/runtime';
import type { PreviewAttemptOutcome, PreviewRuntimeAuthority } from './authority';

export function resolvePreviewAttemptFreshness(
  authority: PreviewRuntimeAuthority,
  request: VideoEditorPreviewPrepareRequest,
  revision: number
): 'cancelled' | 'retry' | null {
  if (request.signal.aborted || authority.generationRef.current !== request.generation) {
    return 'cancelled';
  }
  return authority.configurationRevisionRef.current === revision ? null : 'retry';
}

function publishCacheOutcome(
  authority: PreviewRuntimeAuthority,
  outcome: Exclude<VideoEditorPreviewPrepareOutcome, 'cancelled' | 'live-ready'>
): void {
  authority.publishStatus({
    completedFrames: authority.previewStatusRef.current.completedFrames,
    mode: VideoEditorPreviewMode.CACHE,
    outcome,
    phase:
      outcome === 'video-cache-ready'
        ? 'cached-video-playback'
        : outcome === 'frame-cache-ready'
          ? 'cached-frame-playback'
          : 'recovering',
    totalFrames: authority.previewStatusRef.current.totalFrames,
  });
}

function createLinkedAbortController(signal: AbortSignal) {
  const controller = new AbortController();
  const handleAbort = () => controller.abort(signal.reason);
  if (signal.aborted) handleAbort();
  else signal.addEventListener('abort', handleAbort, { once: true });
  return { controller, dispose: () => signal.removeEventListener('abort', handleAbort) };
}

export async function buildPreviewCacheAttempt(params: {
  authority: PreviewRuntimeAuthority;
  request: VideoEditorPreviewPrepareRequest;
  revision: number;
}): Promise<PreviewAttemptOutcome> {
  const { authority, request, revision } = params;
  const latest = authority.latestStateRef.current;
  const linked = createLinkedAbortController(request.signal);
  authority.activePreparationRef.current = linked.controller;
  try {
    const result = await buildVideoPreviewCache({
      assetUrls: latest.assetUrls,
      cache: latest.previewExactFrameCache,
      onProgress: (phase, completedFrames, totalFrames) => {
        if (
          !resolvePreviewAttemptFreshness(authority, request, revision) &&
          !linked.controller.signal.aborted
        ) {
          authority.publishStatus({
            completedFrames,
            mode: VideoEditorPreviewMode.CACHE,
            phase,
            totalFrames,
          });
        }
      },
      ownerDocument: document,
      playbackRange: latest.playbackRange,
      project: latest.project,
      rasterSize: latest.previewRasterSize,
      signal: linked.controller.signal,
    });
    const stale = resolvePreviewAttemptFreshness(authority, request, revision);
    if (stale) return stale;
    authority.setCachedVideo(result.cachedVideo);
    publishCacheOutcome(authority, result.outcome);
    return result.outcome;
  } catch {
    const stale = resolvePreviewAttemptFreshness(authority, request, revision);
    if (stale) return stale;
    authority.setCachedVideo(null);
    publishCacheOutcome(authority, 'failed');
    return 'failed';
  } finally {
    linked.dispose();
    if (authority.activePreparationRef.current === linked.controller) {
      authority.activePreparationRef.current = null;
    }
  }
}
