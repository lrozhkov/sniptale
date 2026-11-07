import { createCameraCropGpuRenderer } from '../../features/video/composition/canvas/camera-crop-gpu';
import type {
  GpuPreviewFramePresenter,
  GpuPreviewOutput,
} from '../../features/video/composition/canvas/preview-presentation';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import type {
  QuickEditWebcam,
  QuickEditWebcamCrop,
} from '../../features/video/review/advanced/webcam';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';

interface WebcamCropPaintInput {
  camera: QuickEditWebcam;
  crop: QuickEditWebcamCrop;
  renderer: VideoPreviewRenderer;
}

/** One source-local job and one latest request; accepted publication outlives its producer. */
export function createWebcamCropPaintOwner(options: {
  target: HTMLCanvasElement;
  media: HTMLVideoElement;
  presenter: GpuPreviewFramePresenter;
  fail(): void;
  createRenderer?: typeof createCameraCropGpuRenderer;
}) {
  let gpu: ReturnType<typeof createCameraCropGpuRenderer> | null = null;
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
  const renderFrame = async (input: WebcamCropPaintInput, ticket: number) => {
    const media = options.media,
      target = options.target;
    if (media.seeking || media.readyState < 2) return;
    controller = new AbortController();
    const signal = controller.signal;
    const time = media.currentTime,
      url = media.currentSrc || media.src;
    const box = target.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const size = {
      width: Math.max(1, Math.round(box.width * scale)),
      height: Math.max(1, Math.round(box.height * scale)),
    };
    let output: GpuPreviewOutput | undefined | false;
    let accepted = false;
    try {
      if (reset || input.renderer === 'legacy') {
        gpu?.dispose();
        gpu = null;
        reset = false;
      }
      if (input.renderer !== 'legacy') {
        gpu ??= (options.createRenderer ?? createCameraCropGpuRenderer)();
        output = await gpu.render({
          media,
          size,
          appearance: { ...input.camera.appearance, ...input.crop },
          fitMode: 'COVER',
          mirrored: input.camera.mirrored,
          signal,
          acquire: options.presenter.acquire,
        });
      }
      if (!acceptsSource(ticket, signal, time, url)) return;
      if (output === false) return;
      if (!output) {
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
          { width: media.videoWidth, height: media.videoHeight },
          { draw: (ctx, x, y, w, h) => ctx.drawImage(media, x, y, w, h) },
          input.crop
        );
      }
      options.presenter.publish(output ?? null, () => {});
      accepted = true;
    } catch {
      if (!disposed && !signal.aborted && ticket === version) options.fail();
    } finally {
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
    },
  };
}
