import { VideoSample } from 'mediabunny';
import {
  createPreviewSourceProvider,
  type PreviewSourceProvider,
} from '../../workflows/video/preview-source';
import {
  createPreviewHtmlSourceProvider,
  type PreparedPreviewSourceLease,
} from '../../workflows/video/preview-html-source';
import { prepareDecodedVideoSample } from '../../features/video/composition/draw/decoded-sample';
import { createCameraCropGpuRenderer } from '../../features/video/composition/canvas/camera-crop-gpu';
import {
  inspectorPreviewBackingSize,
  type GpuPreviewFramePresenter,
  type GpuPreviewOutput,
} from '../../features/video/composition/canvas/preview-presentation';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import type {
  QuickEditWebcam,
  QuickEditWebcamCrop,
} from '../../features/video/review/advanced/webcam';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';

interface WebcamCropSourceRequest {
  url: string;
  assetId: string;
  attempt: number;
  time: number;
}

interface WebcamCropPaintInput {
  camera: QuickEditWebcam;
  crop: QuickEditWebcamCrop;
  renderer: VideoPreviewRenderer;
  source?: WebcamCropSourceRequest;
}

/** One source-local job and one latest request; accepted publication outlives its producer. */
export function createWebcamCropPaintOwner(options: {
  target: HTMLCanvasElement;
  media: HTMLVideoElement;
  presenter: GpuPreviewFramePresenter;
  fail(): void;
  createRenderer?: typeof createCameraCropGpuRenderer;
  readSource?: () => WebcamCropSourceRequest | null;
  accept?: (
    input: WebcamCropPaintInput,
    image: {
      width: number;
      height: number;
      timestamp?: number;
      nextTimestamp?: number;
      heldAtEnd?: true;
      heldSourceEnd?: number;
    }
  ) => void;
}) {
  let gpu: ReturnType<typeof createCameraCropGpuRenderer> | null = null;
  let provider: PreviewSourceProvider | null = null;
  let compatible: ReturnType<typeof createPreviewHtmlSourceProvider> | null = null;
  let pending: WebcamCropPaintInput | null = null;
  let controller: AbortController | null = null;
  let running = false,
    disposed = false,
    reset = false,
    version = 0;
  const cancel = () => {
    version++;
    pending = null;
    controller?.abort();
  };
  const acceptsSource = (ticket: number, signal: AbortSignal, time: number, url: string) =>
    !disposed &&
    !signal.aborted &&
    ticket === version &&
    !options.media.seeking &&
    options.media.readyState >= 2 &&
    options.media.currentTime === time &&
    (options.media.currentSrc || options.media.src) === url;
  const acceptsRequest = (input: WebcamCropPaintInput) => {
    if (!options.readSource || !input.source) return true;
    const current = options.readSource();
    return (
      !!current &&
      current.url === input.source.url &&
      current.assetId === input.source.assetId &&
      current.attempt === input.source.attempt &&
      current.time === input.source.time
    );
  };
  const renderFrame = async (input: WebcamCropPaintInput, ticket: number) => {
    const media = options.media,
      target = options.target;
    const managed = !!input.source && typeof VideoFrame !== 'undefined';
    if (!managed && (media.seeking || media.readyState < 2)) return;
    controller = new AbortController();
    const signal = controller.signal;
    const time = media.currentTime,
      url = media.currentSrc || media.src;
    const size = inspectorPreviewBackingSize(target);
    let output: GpuPreviewOutput | undefined | false;
    let accepted = false;
    let lease: PreparedPreviewSourceLease | null = null;
    let canvasSample: VideoSample | undefined;
    try {
      if (reset) {
        provider?.dispose();
        provider = null;
        compatible?.dispose();
        compatible = null;
      }
      if (reset || input.renderer === 'legacy') {
        gpu?.dispose();
        gpu = null;
        reset = false;
      }
      if (managed && input.source) {
        const demands = [
          {
            id: 'camera-crop',
            url: input.source.url,
            time: input.source.time,
            holdSourceEnd: true as const,
          },
        ];
        if (typeof VideoDecoder !== 'undefined') {
          provider ??= createPreviewSourceProvider();
          provider.retainSources(new Set([input.source.url]));
          lease = await provider.acquire(demands, signal, { discontinuity: true });
        }
        if (!lease) {
          signal.throwIfAborted();
          compatible ??= createPreviewHtmlSourceProvider();
          compatible.retainSources(new Set([input.source.url]));
          lease = await compatible.acquire(demands, signal);
        }
      }
      if (disposed || signal.aborted || ticket !== version || !acceptsRequest(input)) return;
      const binding = lease?.bindings.get('camera-crop');
      if (lease && !binding) throw new Error('Camera preview source binding is unavailable.');
      const source = binding?.source;
      if (!source) {
        if (media.error) throw new Error('Camera compatibility source is unavailable.');
      }
      if (!source && !acceptsSource(ticket, signal, time, url)) return;
      if (input.renderer !== 'legacy') {
        gpu ??= (options.createRenderer ?? createCameraCropGpuRenderer)();
        output = await gpu.render({
          media,
          ...(source ? { source } : {}),
          size,
          appearance: { ...input.camera.appearance, ...input.crop },
          fitMode: 'COVER',
          mirrored: input.camera.mirrored,
          signal,
          acquire: options.presenter.acquire,
        });
      }
      if (
        disposed ||
        signal.aborted ||
        ticket !== version ||
        !acceptsRequest(input) ||
        (!source && !acceptsSource(ticket, signal, time, url))
      )
        return;
      if (output === false) return;
      if (!output) {
        if (source) {
          if (!source.toVideoFrame) throw new Error('Camera preview source frame is unavailable.');
          canvasSample = await prepareDecodedVideoSample(
            new VideoSample(source.toVideoFrame(), source.orientation),
            signal
          );
          if (disposed || signal.aborted || ticket !== version || !acceptsRequest(input)) return;
        }
        target.width = size.width;
        target.height = size.height;
        const context = target.getContext('2d');
        if (!context) throw new Error('Camera preview context is unavailable.');
        context.clearRect(0, 0, size.width, size.height);
        drawReviewWebcam(
          context,
          size,
          { ...input.camera, shadow: { intensity: 0, color: '#000000ff' } },
          { x: 0, y: 0, width: 1, height: 1 },
          {
            width: source?.sourceWidth ?? media.videoWidth,
            height: source?.sourceHeight ?? media.videoHeight,
          },
          {
            draw: (ctx, x, y, w, h) =>
              canvasSample ? canvasSample.draw(ctx, x, y, w, h) : ctx.drawImage(media, x, y, w, h),
          },
          input.crop
        );
      }
      options.presenter.publish(output ?? null, () =>
        options.accept?.(input, {
          width: source?.sourceWidth ?? media.videoWidth,
          height: source?.sourceHeight ?? media.videoHeight,
          ...(binding
            ? {
                timestamp: binding.timestamp,
                ...('nextTimestamp' in binding ? { nextTimestamp: binding.nextTimestamp } : {}),
                ...('heldSourceEnd' in binding && binding.heldSourceEnd !== undefined
                  ? { heldSourceEnd: binding.heldSourceEnd }
                  : {}),
                ...(binding.heldAtEnd ? { heldAtEnd: true as const } : {}),
              }
            : {}),
        })
      );
      accepted = true;
    } catch {
      if (!disposed && !signal.aborted && ticket === version && acceptsRequest(input))
        options.fail();
    } finally {
      canvasSample?.close();
      lease?.release();
      if (output && !accepted) output.release();
      if (controller?.signal === signal) controller = null;
    }
  };
  const drain = async () => {
    try {
      while (pending && !disposed) {
        const input = pending;
        pending = null;
        await renderFrame(input, version);
      }
    } finally {
      running = false;
    }
  };
  return {
    request(input: WebcamCropPaintInput) {
      if (disposed) return;
      version++;
      pending = input;
      controller?.abort();
      if (!running) {
        running = true;
        void Promise.resolve()
          .then(drain)
          .catch(() => {
            if (!disposed) options.fail();
          });
      }
    },
    cancel,
    reset() {
      cancel();
      reset = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      gpu?.dispose();
      gpu = null;
      provider?.dispose();
      provider = null;
      compatible?.dispose();
      compatible = null;
    },
  };
}
