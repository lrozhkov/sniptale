import { createBookendPreviewGpuRenderer } from '../../features/video/composition/canvas/bookend-preview-gpu';
import type {
  GpuPreviewFramePresenter,
  GpuPreviewOutput,
} from '../../features/video/composition/canvas/preview-presentation';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';
import type { createReviewPresentationMedia } from '../../workflows/video-review/presentation-media';

type Slot = Exclude<QuickEditPresentationSettings['intro'], { mode: 'none' }>;
type Media = Awaited<ReturnType<typeof createReviewPresentationMedia>>;
/** Render parameters are disposable; the source key binds the admitted media owner. */
export interface PresentationMediaPaintInput {
  sourceKey: string;
  slot: Slot;
  time: number;
  renderer: VideoPreviewRenderer;
}
function mapping(input: PresentationMediaPaintInput) {
  const slot = input.slot;
  if (slot.mode === 'image') return { kind: 'image' as const, assetId: slot.image.assetId };
  const time = Math.min(slot.video.trim.end, Math.max(slot.video.trim.start, input.time));
  return {
    kind: 'video' as const,
    assetId: slot.video.assetId,
    range: { start: time, end: time },
    holdLast: time === slot.video.trim.end,
  };
}
function recipe(input: PresentationMediaPaintInput) {
  return input.slot.mode === 'image' ? input.slot.image : input.slot.video;
}
function frameKey(input: PresentationMediaPaintInput) {
  const current = recipe(input);
  return JSON.stringify([
    input.sourceKey,
    mapping(input),
    input.renderer,
    current.fit,
    current.fillColor,
    current.crop.panX,
    current.crop.panY,
  ]);
}

/** Owns one detached source snapshot and one active/latest job, never the admitted decoder. */
export function createPresentationMediaPaintOwner(options: {
  sourceKey: string;
  media: Media;
  canvas: HTMLCanvasElement;
  output: { width: number; height: number };
  presenter: GpuPreviewFramePresenter;
  read(): PresentationMediaPaintInput;
  ready(): void;
  fail(): void;
  createRenderer?: typeof createBookendPreviewGpuRenderer;
}) {
  let gpu: ReturnType<typeof createBookendPreviewGpuRenderer> | null = null;
  let cached: { key: string; bitmap: ImageBitmap } | null = null;
  let controller: AbortController | null = null;
  let disposed = false,
    running = false,
    pending = false,
    retireSource = false,
    version = 0;
  const closeSource = () => {
    const previous = cached;
    cached = null;
    previous?.bitmap.close();
  };
  const retire = () => {
    if (retireSource) {
      retireSource = false;
      closeSource();
    }
  };
  const cancel = () => {
    version++;
    pending = false;
    retireSource = true;
    controller?.abort();
    if (!running) retire();
  };
  const accepts = (input: PresentationMediaPaintInput, ticket: number, key: string) => {
    if (disposed || ticket !== version || input.sourceKey !== options.sourceKey) return false;
    return frameKey(options.read()) === key;
  };
  const legacy = async (input: PresentationMediaPaintInput, ticket: number, key: string) => {
    const lease = await options.media.frame(mapping(input), input.slot);
    try {
      if (!accepts(input, ticket, key)) return;
      const context = options.canvas.getContext('2d');
      if (!context) throw new Error('Presentation preview context is unavailable.');
      lease.draw(context);
      if (!accepts(input, ticket, key)) return;
      options.presenter.publish(null, options.ready);
    } finally {
      lease.release();
    }
  };
  const snapshot = async (input: PresentationMediaPaintInput, ticket: number, key: string) => {
    const sourceKey = JSON.stringify(mapping(input));
    if (cached?.key === sourceKey) return cached.bitmap;
    closeSource();
    const lease = await options.media.frame(mapping(input), input.slot);
    let bitmap: ImageBitmap | undefined;
    try {
      if (!accepts(input, ticket, key)) return;
      bitmap = lease.snapshot();
      if (!accepts(input, ticket, key)) return;
      cached = { key: sourceKey, bitmap };
      const result = bitmap;
      bitmap = undefined;
      return result;
    } finally {
      bitmap?.close();
      lease.release();
    }
  };
  const paint = async (input: PresentationMediaPaintInput, ticket: number, key: string) => {
    if (!accepts(input, ticket, key)) return;
    const snapshotAvailable =
      typeof OffscreenCanvas !== 'undefined' &&
      typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function';
    if (input.renderer === 'legacy') {
      gpu?.dispose();
      gpu = null;
    }
    if (input.renderer === 'legacy' || !snapshotAvailable || gpu?.fallbackReason) {
      closeSource();
      await legacy(input, ticket, key);
      return;
    }
    const pixels = await snapshot(input, ticket, key);
    if (!pixels || !accepts(input, ticket, key)) return;
    gpu ??= (options.createRenderer ?? createBookendPreviewGpuRenderer)();
    controller = new AbortController();
    let output: GpuPreviewOutput | undefined | false;
    let accepted = false;
    try {
      const source = input.slot.mode === 'image' ? input.slot.image : input.slot.video.source;
      const current = recipe(input);
      output = await gpu.render({
        source: pixels,
        sourceSize: { width: source.width, height: source.height },
        output: options.output,
        logical: options.output,
        framing: {
          fit: current.fit,
          fillColor: current.fillColor,
          crop: { panX: current.crop.panX, panY: current.crop.panY },
        },
        signal: controller.signal,
        acquire: options.presenter.acquire,
      });
      if (controller.signal.aborted || !accepts(input, ticket, key) || output === false) return;
      if (output) {
        options.presenter.publish(output, options.ready);
        accepted = true;
      } else {
        closeSource();
        await legacy(input, ticket, key);
      }
    } finally {
      if (output && !accepted) output.release();
      controller = null;
    }
  };
  const drain = async () => {
    try {
      while (pending && !disposed) {
        retire();
        pending = false;
        const input = options.read(),
          ticket = version,
          key = frameKey(input);
        try {
          await paint(input, ticket, key);
        } catch {
          if (accepts(input, ticket, key)) {
            cancel();
            options.fail();
          }
        }
      }
    } finally {
      running = false;
      retire();
      if (disposed) closeSource();
    }
  };
  return {
    request() {
      if (disposed) return;
      version++;
      pending = true;
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
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      gpu?.dispose();
      gpu = null;
    },
  };
}
