import { resolveVideoCompositionRenderPasses } from '../../features/video/composition/timeline/render';
import { hasCameraMediaAt } from '../../features/video/project/camera/animation';
import { getMediaClipSourceTime, isClipActiveAtTime } from '../../features/video/project/timeline';
import type { VideoProject, VideoProjectVideoClip } from '../../features/video/project/types';
import type { VideoCompositionFrameSource } from '../../features/video/composition/draw/media-source';
import { readRetainedTransitionSample } from './cut-transition-frames';
import { prepareDecodedVideoSample } from '../../features/video/composition/draw/decoded-sample';
import type { VideoSampleSink } from 'mediabunny';
import { classifyReviewExportFailure, reviewExportPhase } from './export-diagnostics';

type ReviewSampleSink = Pick<VideoSampleSink, 'getSample' | 'samples' | 'samplesAtTimestamps'>;

/** Normalizes moving and transition endpoint frames at the shared export decode boundary. */
export function createReviewDecodedSampleSink(
  sink: ReviewSampleSink,
  signal: AbortSignal,
  config?: VideoDecoderConfig | null
) {
  // VP8 defaults to BT.601. The SDK assumes BT.709 when container metadata is absent.
  const colorSpace =
    config?.codec === 'vp8' && !config.colorSpace?.matrix
      ? { matrix: 'smpte170m' as const }
      : undefined;
  return {
    async getSample(time: number) {
      return reviewExportPhase(signal, 'decode', async () => {
        const sample = await sink.getSample(time);
        return sample ? prepareDecodedVideoSample(sample, signal, colorSpace) : null;
      });
    },
    async *samples(start: number, end: number) {
      try {
        for await (const sample of sink.samples(start, end))
          yield await prepareDecodedVideoSample(sample, signal, colorSpace);
      } catch (error) {
        throw classifyReviewExportFailure(signal, 'decode', error);
      }
    },
    async *samplesAtTimestamps(times: Iterable<number> | AsyncIterable<number>) {
      try {
        for await (const sample of sink.samplesAtTimestamps(times))
          yield sample ? await prepareDecodedVideoSample(sample, signal, colorSpace) : null;
      } catch (error) {
        throw classifyReviewExportFailure(signal, 'decode', error);
      }
    },
  };
}

/** Owns decoder inputs for cut scenes. Scene leases own their returned drawable samples. */
export function createCompositionCutSampleSource(params: {
  project: VideoProject;
  sourceUrl(clip: VideoProjectVideoClip): string | undefined;
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
          await track.getDecoderConfig()
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
    async sample(time: number, signal: AbortSignal, fallback: 'first' | 'last') {
      const owned: { close(): void }[] = [];
      const media = new Map<string, VideoCompositionFrameSource>();
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
        const passes = resolveVideoCompositionRenderPasses(params.project, time);
        const needed = new Set(
          [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].flatMap((frame) =>
            frame.visualLayers
              .filter((layer) => layer.kind === 'video')
              .map((layer) => layer.clipId)
          )
        );
        for (const clip of params.project.clips) {
          if (
            clip.type !== 'VIDEO' ||
            !needed.has(clip.id) ||
            !isClipActiveAtTime(clip, time) ||
            !hasCameraMediaAt(params.project, clip, time)
          )
            continue;
          const url = params.sourceUrl(clip);
          if (!url) throw new Error('Cut source media is unavailable.');
          const sink = await open(url);
          check();
          const offset = clip.cameraTiming?.offsetSeconds ?? 0;
          const range = {
            start: clip.sourceStart - offset,
            end: clip.sourceStart + clip.sourceDuration - offset,
          };
          const sample = await readRetainedTransitionSample(
            sink,
            range,
            getMediaClipSourceTime(clip, time),
            fallback,
            check
          );
          if (!sample) throw new Error('Cut source has no retained video frame.');
          owned.push(sample);
          check();
          media.set(clip.id, {
            sourceWidth: sample.displayWidth,
            sourceHeight: sample.displayHeight,
            draw: (context, x, y, width, height) => sample.draw(context, x, y, width, height),
          });
        }
        return { media, release };
      } catch (error) {
        release();
        throw error;
      } finally {
        signal.removeEventListener('abort', dispose);
      }
    },
  };
}
