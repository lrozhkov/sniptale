import { getClipPlaybackOffset } from '../../features/video/project/timeline/rate';
import { resolveVideoCompositionRenderPasses } from '../../features/video/composition/timeline/render';
import { hasCameraMediaAt } from '../../features/video/project/camera/animation';
import { getVideoClipSourceTime, isClipActiveAtTime } from '../../features/video/project/timeline';
import type { VideoProject, VideoProjectVideoClip } from '../../features/video/project/types';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import { readRetainedTransitionSample } from './cut-transition-frames';
import {
  prepareDecodedVideoSample,
  decodedSampleFrameSource,
} from '../../features/video/composition/draw/decoded-sample';
import type { VideoSample, VideoSampleSink } from 'mediabunny';
import type {
  VideoCompositionFrame,
  VideoCompositionVisualLayer,
} from '../../features/video/composition/types';
import { classifyReviewExportFailure, reviewExportPhase } from './export-diagnostics';

type ReviewSampleSink = Pick<VideoSampleSink, 'getSample' | 'samples' | 'samplesAtTimestamps'>;

/** Aligns VP8 inferred color with SDK defaults while retaining explicit source metadata. */
export function resolveReviewDecodedColorPatch(
  config?: VideoDecoderConfig | null,
  actual?: { format: VideoPixelFormat | null; colorSpace: VideoColorSpaceInit }
): VideoColorSpaceInit | undefined {
  if (config?.codec !== 'vp8') return undefined;
  if (!actual) return config.colorSpace?.matrix ? undefined : { matrix: 'smpte170m' };
  const source = config.colorSpace;
  const primaries = source?.primaries ?? 'bt709';
  const transfer = source?.transfer ?? 'bt709';
  const matrix = source?.matrix ?? 'smpte170m';
  const fullRange = source?.fullRange ?? false;
  // RGB planes already carry converted channel values; YUV matrix/range no longer apply.
  const rgb = actual.format?.includes('RGB') || actual.format?.includes('BGR');
  const patch = {
    ...(actual.colorSpace.primaries !== primaries ? { primaries } : {}),
    ...(actual.colorSpace.transfer !== transfer ? { transfer } : {}),
    ...(!rgb && actual.colorSpace.matrix !== matrix ? { matrix } : {}),
    ...(!rgb && actual.colorSpace.fullRange !== fullRange ? { fullRange } : {}),
  };
  return Object.keys(patch).length ? patch : undefined;
}

/** Normalizes moving and transition endpoint frames at the shared export decode boundary. */
export function createReviewDecodedSampleSink(
  sink: ReviewSampleSink,
  signal: AbortSignal,
  config?: VideoDecoderConfig | null,
  conversion: 'canvas' | 'native' = 'canvas'
) {
  // VP8 defaults to BT.601. The SDK assumes BT.709 when container metadata is absent.
  const colorSpace = resolveReviewDecodedColorPatch(config);
  const prepare = (sample: VideoSample) => {
    if (signal.aborted) {
      sample.close();
      signal.throwIfAborted();
    }
    return conversion === 'native' && !colorSpace
      ? sample
      : prepareDecodedVideoSample(sample, signal, colorSpace);
  };
  return {
    async getSample(time: number) {
      return reviewExportPhase(signal, 'decode', async () => {
        const sample = await sink.getSample(time);
        return sample ? prepare(sample) : null;
      });
    },
    async *samples(start: number, end: number) {
      try {
        for await (const sample of sink.samples(start, end)) yield await prepare(sample);
      } catch (error) {
        throw classifyReviewExportFailure(signal, 'decode', error);
      }
    },
    async *samplesAtTimestamps(times: Iterable<number> | AsyncIterable<number>) {
      try {
        for await (const sample of sink.samplesAtTimestamps(times))
          yield sample ? await prepare(sample) : null;
      } catch (error) {
        throw classifyReviewExportFailure(signal, 'decode', error);
      }
    },
  };
}

/** Unmigrated export callers retain their original nominal clip selection. */
function resolveNominalCutContext(project: VideoProject, time: number) {
  const passes = resolveVideoCompositionRenderPasses(project, time);
  const layers = [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)]
    .flatMap((frame) => frame.visualLayers)
    .filter((layer) => layer.kind === 'video');
  const visualLayers = project.clips.flatMap((clip) => {
    if (
      clip.type !== 'VIDEO' ||
      !isClipActiveAtTime(clip, time) ||
      !hasCameraMediaAt(project, clip, time)
    )
      return [];
    const layer = layers.find((layer) => layer.clipId === clip.id);
    return layer ? [{ ...layer, clip }] : [];
  });
  return { time, frame: { ...passes.overlayFrame, visualLayers, effectInputLayers: [] } };
}

/** Owns decoder inputs for cut scenes. Scene leases own their returned drawable samples. */
export function createCompositionCutSampleSource(params: {
  project: VideoProject;
  sourceUrl(clip: VideoProjectVideoClip): string | undefined;
  /** GPU sampling preserves the original external texture; Canvas callers retain plane packing. */
  conversion?: 'canvas' | 'native';
}) {
  const controller = new AbortController();
  const inputs = new Set<{ dispose(): void }>();
  const sources = new Map<string, Promise<ReturnType<typeof createReviewDecodedSampleSink>>>();
  const live = () => controller.signal.throwIfAborted();
  const open = (url: string) => {
    const previous = sources.get(url);
    if (previous) return previous;
    const pending = (async () => {
      const sdk = await import('mediabunny');
      live();
      const input = new sdk.Input({ source: new sdk.UrlSource(url), formats: sdk.ALL_FORMATS });
      inputs.add(input);
      try {
        const track = await input.getPrimaryVideoTrack();
        live();
        if (!track || !(await track.canDecode())) throw new Error('Cut video cannot be decoded.');
        live();
        return createReviewDecodedSampleSink(
          new sdk.VideoSampleSink(track),
          controller.signal,
          await track.getDecoderConfig(),
          params.conversion
        );
      } catch (error) {
        if (inputs.delete(input)) input.dispose();
        throw error;
      }
    })();
    sources.set(url, pending);
    void pending.catch(() => {
      if (sources.get(url) === pending) sources.delete(url);
    });
    return pending;
  };
  const dispose = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    for (const input of inputs) input.dispose();
    inputs.clear();
    sources.clear();
  };
  return {
    dispose,
    /** The explicit snapshot is fixed for this request; source decoders remain keyed by URL. */
    async sample(
      time: number,
      signal: AbortSignal,
      fallback: 'first' | 'last',
      project: VideoProject = params.project,
      contexts?: readonly { frame: VideoCompositionFrame; time: number }[]
    ) {
      const owned: { close(): void }[] = [];
      const bindings = new Map<
        string,
        {
          source: VideoCompositionFrameSource;
          target: number;
          timestamp: number;
          url: string;
          endpoint: 'first' | 'last';
        }
      >();
      const videoLayers = (layers: readonly VideoCompositionVisualLayer[]) =>
        layers.flatMap((layer) =>
          layer.kind === 'video'
            ? [layer]
            : layer.kind === 'effect' && layer.sourceAttachment?.owner.kind === 'video'
              ? [layer.sourceAttachment.owner]
              : []
        );
      const keyFor = (clip: VideoProjectVideoClip, passTime: number) =>
        JSON.stringify([
          clip.id,
          clip.assetId,
          getVideoClipSourceTime(clip, passTime),
          clip.sourceStart,
          clip.sourceDuration,
          clip.cameraTiming?.offsetSeconds ?? 0,
        ]);
      const forFrame = (
        frame: Pick<VideoCompositionFrame, 'visualLayers'>,
        passTime: number,
        layers: readonly VideoCompositionVisualLayer[] = frame.visualLayers
      ) => {
        const media = new Map<string, VideoCompositionFrameSource>();
        for (const layer of videoLayers(layers)) {
          const binding = bindings.get(keyFor(layer.clip, passTime));
          if (!binding) throw new Error('Cut source context is unavailable.');
          media.set(layer.clipId, binding.source);
        }
        return media;
      };
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        for (const sample of owned) sample.close();
      };
      const check = () => {
        live();
        signal.throwIfAborted();
      };
      signal.addEventListener('abort', dispose, { once: true });
      if (signal.aborted) dispose();
      try {
        check();
        const selected = contexts ?? [resolveNominalCutContext(project, time)];
        for (const context of selected) {
          for (const layer of videoLayers([
            ...context.frame.visualLayers,
            ...context.frame.effectInputLayers,
          ])) {
            const clip = layer.clip;
            const key = keyFor(clip, context.time);
            if (bindings.has(key)) continue;
            const url = params.sourceUrl(clip);
            if (!url) throw new Error('Cut source media is unavailable.');
            const sink = await open(url);
            check();
            const offset = clip.cameraTiming?.offsetSeconds ?? 0;
            const range = {
              start: clip.sourceStart - offset,
              end: clip.sourceStart + clip.sourceDuration - offset,
            };
            const target = getVideoClipSourceTime(clip, context.time);
            const endpoint =
              clip.playbackWindow?.holdAt !== undefined &&
              getClipPlaybackOffset(clip, context.time) >= clip.playbackWindow.holdAt
                ? 'last'
                : fallback;
            const sample = await readRetainedTransitionSample(sink, range, target, endpoint, check);
            if (!sample) throw new Error('Cut source has no retained video frame.');
            owned.push(sample);
            check();
            bindings.set(key, {
              target,
              timestamp: sample.timestamp,
              url,
              endpoint,
              source: decodedSampleFrameSource(sample),
            });
          }
        }
        const nominal = selected[0];
        const media = nominal
          ? forFrame(nominal.frame, nominal.time)
          : new Map<string, VideoCompositionFrameSource>();
        return { media, bindings, forFrame, release };
      } catch (error) {
        release();
        throw error;
      } finally {
        signal.removeEventListener('abort', dispose);
      }
    },
  };
}
