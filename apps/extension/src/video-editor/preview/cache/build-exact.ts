import {
  cacheExactVideoPreviewFrame,
  hasExactVideoPreviewFrame,
  reportVideoPreviewBuildProgress,
  type FreshVideoPreviewBuildContext,
  type VideoPreviewCacheBuildResult,
} from './runtime-support';

export async function buildExactVideoPreviewFrames(
  context: FreshVideoPreviewBuildContext
): Promise<VideoPreviewCacheBuildResult> {
  const totalFrames = context.range.endFrame - context.range.startFrame;
  const preparedFrames = Math.min(totalFrames, context.exactFrameCapacity);
  let exactFramesCached = 0;
  for (let offset = 0; offset < preparedFrames; offset += 1) {
    const frameIndex = context.range.startFrame + offset;
    if (hasExactVideoPreviewFrame(context, frameIndex)) {
      exactFramesCached += 1;
    } else {
      const canvas = await context.materializer.renderFrame(
        frameIndex / context.params.project.fps,
        context.params.signal
      );
      if (await cacheExactVideoPreviewFrame(context, frameIndex, canvas)) {
        exactFramesCached += 1;
      }
    }
    reportVideoPreviewBuildProgress(context, 'preparing-frame-cache', offset + 1);
  }
  return {
    cachedVideo: null,
    outcome:
      exactFramesCached === totalFrames
        ? 'frame-cache-ready'
        : exactFramesCached === 0
          ? 'unavailable'
          : 'capacity-limited',
  };
}
