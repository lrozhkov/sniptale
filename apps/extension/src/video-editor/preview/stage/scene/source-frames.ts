import { getClipPlaybackOffset } from '../../../../features/video/project/timeline/rate';
import type { PreviewSourceDemand } from '../../../../workflows/video/preview-source';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualLayer,
} from '../../../../features/video/composition/types';
import type { VideoCompositionFrameSource } from '../../../../features/video/composition/draw/media-source';
import { getVideoClipSourceTime } from '../../../../features/video/project/timeline';
import type { PreviewSceneRenderInput, PreviewSceneSourceFrames } from './types';
export type { PreviewSceneSourceFrames } from './types';
import type { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';

type Passes = ReturnType<typeof resolveVideoCompositionRenderPasses>;
type VideoLayer = Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
function videoLayers(layers: readonly VideoCompositionVisualLayer[]): VideoLayer[] {
  return layers
    .flatMap((layer) =>
      layer.kind === 'video'
        ? [layer]
        : layer.kind === 'effect' && layer.sourceAttachment
          ? [layer.sourceAttachment.owner]
          : []
    )
    .filter((layer): layer is VideoLayer => layer.kind === 'video');
}
/** Source time uses the actual exposure clip and physical pass time supplied by the resolver. */
export async function preparePreviewSourceFrames(
  input: PreviewSceneRenderInput,
  passes: Passes
): Promise<PreviewSceneSourceFrames | undefined> {
  const runtime = input.sourceRuntime;
  if (!runtime?.selected) return undefined;
  const contexts = [
    { frame: passes.overlayFrame, time: input.currentTime },
    ...passes.visualPasses.map((pass) => ({ frame: pass.frame, time: pass.time })),
  ];
  const keys = new Map<Pick<VideoCompositionFrame, 'visualLayers'>, Map<string, string>>();
  const demands: PreviewSourceDemand[] = [];
  const keyFor = (layer: VideoLayer, time: number) =>
    JSON.stringify([layer.clipId, layer.clip.assetId, getVideoClipSourceTime(layer.clip, time)]);
  for (const { frame, time } of contexts) {
    if (keys.has(frame)) continue;
    const frameKeys = new Map<string, string>();
    keys.set(frame, frameKeys);
    for (const layer of videoLayers([...frame.visualLayers, ...frame.effectInputLayers])) {
      const key = keyFor(layer, time);
      if (frameKeys.has(key)) continue;
      const url = input.assetUrls?.[layer.clip.assetId];
      if (!url) return undefined;
      const id = String(demands.length);
      frameKeys.set(key, id);
      const offset = layer.clip.cameraTiming?.offsetSeconds ?? 0;
      const sourceTime = getVideoClipSourceTime(layer.clip, time);
      const rangeEnd = layer.clip.sourceStart + layer.clip.sourceDuration - offset;
      const retainedEnd =
        layer.clip.playbackWindow?.holdAt !== undefined &&
        getClipPlaybackOffset(layer.clip, time) >= layer.clip.playbackWindow.holdAt &&
        sourceTime === rangeEnd;
      demands.push({
        id,
        url,
        time: sourceTime,
        rangeStart: layer.clip.sourceStart - offset,
        rangeEnd,
        ...(retainedEnd ? { endpoint: 'retained-end' as const } : {}),
      });
    }
  }
  const lease = await runtime.acquire(demands, input.signal ?? new AbortController().signal, {
    discontinuity: input.isPlaybackFrame !== true,
  });
  if (!lease) return undefined;
  const media = (
    frame: Pick<VideoCompositionFrame, 'visualLayers'>,
    time: number,
    layers: readonly VideoCompositionVisualLayer[] = frame.visualLayers
  ) => {
    const selected = new Map<string, VideoCompositionFrameSource>();
    for (const layer of videoLayers(layers)) {
      const id = keys.get(frame)?.get(keyFor(layer, time));
      const binding = id === undefined ? undefined : lease.bindings.get(id);
      if (!binding) throw new Error('GPU decoded source frame is unavailable.');
      selected.set(layer.clipId, binding.source);
    }
    return selected;
  };
  try {
    input.signal?.throwIfAborted();
    return {
      nominal: media(passes.overlayFrame, input.currentTime),
      bindings: lease.bindings,
      media,
      release: lease.release,
    };
  } catch (error) {
    lease.release();
    throw error;
  }
}
/** Existing manually prepared inputs retain their established isolation contract. */
export function isPreviewFrameGpuIsolated(input: PreviewSceneRenderInput): boolean {
  return Boolean(
    input.preparedFrame &&
    (input.preparedFrame.sourceFrames ? input.preparedFrame.gpuIsolated : true)
  );
}
