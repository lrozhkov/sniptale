import { createMaterializerGpuOutputs } from './materializer-gpu-outputs';
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
  const gpuOutputs =
    context.params.previewRenderer === 'legacy'
      ? undefined
      : createMaterializerGpuOutputs(context.params.ownerDocument);
  try {
    for (let offset = 0; offset < preparedFrames; offset += 1) {
      const frameIndex = context.range.startFrame + offset;
      if (!hasExactVideoPreviewFrame(context, frameIndex)) {
        const frame = await context.materializer.renderFrameWithPresentation(
          frameIndex / context.params.project.fps,
          context.params.signal,
          undefined,
          gpuOutputs?.acquire
        );
        await cacheExactVideoPreviewFrame(context, frameIndex, frame);
      }
      reportVideoPreviewBuildProgress(context, 'preparing-frame-cache', offset + 1);
    }
  } finally {
    gpuOutputs?.dispose();
  }
  let exactFramesCached = 0;
  for (let offset = 0; offset < preparedFrames; offset += 1) {
    if (hasExactVideoPreviewFrame(context, context.range.startFrame + offset)) {
      exactFramesCached += 1;
    }
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
