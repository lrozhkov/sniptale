import { inspectorPreviewBackingSize } from '../../../../../features/video/composition/canvas/preview-presentation';
import type { VideoSample } from 'mediabunny';
import {
  createPreviewSourceProvider,
  type PreviewSourceProvider,
} from '../../../../../workflows/video/preview-source';
import {
  createPreviewHtmlSourceProvider,
  type PreparedPreviewSourceLease,
} from '../../../../../workflows/video/preview-html-source';
import {
  prepareDecodedVideoSample,
  borrowDecodedSourceSample,
} from '../../../../../features/video/composition/draw/decoded-sample';
import { resolveMediaFitFrame } from '../../../../../features/video/project/window-geometry';
import { createBookendPreviewGpuRenderer } from '../../../../../features/video/composition/canvas/bookend-preview-gpu';
import type {
  GpuPreviewFramePresenter,
  GpuPreviewOutput,
} from '../../../../../features/video/composition/canvas/preview-presentation';
import type { BookendMediaFraming } from '../../../../../features/video/project/scene/bookend-media';
import type {
  PreviewRendererStatus,
  VideoPreviewRenderer,
} from '../../../../../features/video/preview/preferences';

type Size = { width: number; height: number };
type Media = HTMLImageElement | HTMLVideoElement;
export interface BookendPreviewFrameInput {
  source: {
    kind: 'image' | 'video';
    element: Media | null;
    key: string;
    url: string | null;
    time: number;
    rangeEnd?: number | undefined;
    size: Size;
    ready: boolean;
  };
  framing: BookendMediaFraming;
  logical: Size;
  renderer: VideoPreviewRenderer;
}
interface Snapshot {
  element: Media | null;
  key: string;
  url: string;
  time: number;
  rangeEnd?: number | undefined;
  managed: boolean;
  pixels: ImageBitmap;
}

function managed(source: BookendPreviewFrameInput['source']) {
  return source.kind === 'video' && typeof VideoFrame !== 'undefined';
}
function ready(
  source: BookendPreviewFrameInput['source']
): source is BookendPreviewFrameInput['source'] & { url: string } {
  if (managed(source)) return source.ready && !!source.url;
  const media = source.element;
  if (!source.ready || !media || !source.url || (media.currentSrc || media.src) !== source.url)
    return false;
  return media instanceof HTMLVideoElement
    ? !media.seeking && media.readyState >= 2 && Math.abs(media.currentTime - source.time) <= 0.001
    : media.complete && media.naturalWidth > 0 && media.naturalHeight > 0;
}
function matches(snapshot: Snapshot, input: BookendPreviewFrameInput) {
  return (
    ready(input.source) &&
    (snapshot.managed || snapshot.element === input.source.element) &&
    snapshot.key === input.source.key &&
    snapshot.url === input.source.url &&
    snapshot.time === input.source.time &&
    snapshot.rangeEnd === input.source.rangeEnd
  );
}
function frameKey(input: BookendPreviewFrameInput) {
  return JSON.stringify([
    input.source.key,
    input.source.url,
    input.source.time,
    input.source.rangeEnd,
    input.source.size,
    input.framing,
    input.logical,
    input.renderer,
  ]);
}

/** A detached RGB snapshot owns its pixels independently of the decoder and borrowed sample. */
async function normalizedVideoSnapshot(
  lease: PreparedPreviewSourceLease,
  source: BookendPreviewFrameInput['source'],
  signal: AbortSignal
): Promise<ImageBitmap> {
  let sample: VideoSample | undefined;
  let canvas: OffscreenCanvas | undefined;
  let pixels: ImageBitmap | undefined;
  try {
    signal.throwIfAborted();
    const binding = lease.bindings.get('bookend');
    if (!binding?.source.toVideoFrame) throw new Error('Bookend preview source is unavailable.');
    sample = await prepareDecodedVideoSample(
      borrowDecodedSourceSample(
        binding.source.toVideoFrame(),
        binding.timestamp,
        binding.source.orientation
      ),
      signal
    );
    signal.throwIfAborted();
    canvas = new OffscreenCanvas(source.size.width, source.size.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Bookend preview source is unavailable.');
    sample.draw(context, 0, 0, source.size.width, source.size.height);
    pixels = canvas.transferToImageBitmap();
    signal.throwIfAborted();
    const completed = pixels;
    pixels = undefined;
    return completed;
  } finally {
    pixels?.close();
    sample?.close();
    lease.release();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

function paintStandardBookend(
  canvas: HTMLCanvasElement | null | undefined,
  snapshot: Snapshot,
  input: BookendPreviewFrameInput,
  size: Size
) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) throw new Error('Bookend preview canvas is unavailable.');
  const fit = resolveMediaFitFrame({
    source: input.source.size,
    output: input.logical,
    fit: input.framing.fit,
    crop: input.framing.crop,
  });
  canvas.width = size.width;
  canvas.height = size.height;
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = input.framing.fillColor;
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(
    snapshot.pixels,
    (fit.x * size.width) / input.logical.width,
    (fit.y * size.height) / input.logical.height,
    (fit.width * size.width) / input.logical.width,
    (fit.height * size.height) / input.logical.height
  );
}

/** Serial GPU work retains one source snapshot while framing changes, plus one latest request. */
export function createBookendPreviewFrameQueue(options: {
  stage: HTMLDivElement;
  presenter: GpuPreviewFramePresenter;
  fallbackCanvas?(): HTMLCanvasElement | null;
  read(): BookendPreviewFrameInput;
  onPresented(input: BookendPreviewFrameInput, status: PreviewRendererStatus): void;
  onError(): void;
  createRenderer?: typeof createBookendPreviewGpuRenderer;
}) {
  let gpu: ReturnType<typeof createBookendPreviewGpuRenderer> | null = null;
  let cached: Snapshot | null = null;
  let canonical: PreviewSourceProvider | undefined;
  let html: ReturnType<typeof createPreviewHtmlSourceProvider> | undefined;
  const unsupported = new Set<string>();
  const retireProviders = () => {
    canonical?.dispose();
    canonical = undefined;
    html?.dispose();
    html = undefined;
    unsupported.clear();
  };
  let controller: AbortController | null = null;
  let disposed = false,
    running = false,
    pending = false,
    retireSource = false,
    resetGpu = false,
    version = 0;
  const closeSource = () => {
    const previous = cached;
    cached = null;
    previous?.pixels.close();
  };
  const retire = () => {
    if (retireSource) {
      retireSource = false;
      closeSource();
    }
    if (resetGpu) {
      resetGpu = false;
      gpu?.dispose();
      gpu = null;
    }
  };
  const cancel = () => {
    version++;
    pending = false;
    retireSource = true;
    controller?.abort();
    canonical?.retainSources(new Set());
    html?.retainSources(new Set());
    if (!running) retire();
  };
  const capture = async (
    input: BookendPreviewFrameInput,
    signal: AbortSignal
  ): Promise<Snapshot | undefined> => {
    if (cached && matches(cached, input)) return cached;
    closeSource();
    const source = input.source;
    if (!ready(source)) return undefined;
    let pixels: ImageBitmap;
    if (managed(source)) {
      const demands = [
        {
          id: 'bookend',
          url: source.url,
          time: source.time,
          ...(source.rangeEnd === undefined ? {} : { rangeEnd: source.rangeEnd }),
        },
      ];
      canonical ??= createPreviewSourceProvider();
      canonical.retainSources(new Set([source.url]));
      let lease: PreparedPreviewSourceLease | null =
        typeof VideoDecoder === 'undefined' || unsupported.has(source.url)
          ? null
          : await canonical.acquire(demands, signal, { discontinuity: true });
      if (!lease) {
        unsupported.add(source.url);
        html ??= createPreviewHtmlSourceProvider();
        html.retainSources(new Set([source.url]));
        lease = await html.acquire(demands, signal);
      }
      pixels = await normalizedVideoSnapshot(lease, source, signal);
    } else {
      if (typeof createImageBitmap === 'undefined' || !source.element) return undefined;
      // API-absent recovery preserves the existing unverified paused HTML snapshot.
      pixels = await createImageBitmap(source.element);
    }
    const snapshot = {
      element: source.element,
      key: source.key,
      url: source.url,
      time: source.time,
      rangeEnd: source.rangeEnd,
      managed: managed(source),
      pixels,
    };
    if (disposed || signal.aborted || !matches(snapshot, options.read())) {
      pixels.close();
      return undefined;
    }
    cached = snapshot;
    return snapshot;
  };
  const isCurrent = (input: BookendPreviewFrameInput, ticket: number, key: string) => {
    if (disposed || ticket !== version) return false;
    const current = options.read();
    return (
      ready(current.source) &&
      (managed(current.source) || current.source.element === input.source.element) &&
      frameKey(current) === key
    );
  };
  const paint = async (input: BookendPreviewFrameInput, ticket: number) => {
    if (!ready(input.source)) return;
    const size = inspectorPreviewBackingSize(options.stage);
    const key = frameKey(input);
    let output: GpuPreviewOutput | undefined | false;
    let accepted = false;
    let fallback: PreviewRendererStatus['fallback'];
    try {
      controller = new AbortController();
      const prepared = managed(input.source) ? await capture(input, controller.signal) : undefined;
      if (disposed || ticket !== version) return;
      if (input.renderer === 'legacy') {
        gpu?.dispose();
        gpu = null;
        if (!managed(input.source)) closeSource();
      } else if (gpu?.fallbackReason) {
        fallback = gpu.fallbackReason;
      } else {
        const source = prepared ?? (await capture(input, controller.signal));
        if (disposed || ticket !== version) return;
        if (source) {
          gpu ??= (options.createRenderer ?? createBookendPreviewGpuRenderer)();
          output = await gpu.render({
            source: source.pixels,
            sourceSize: input.source.size,
            output: size,
            logical: input.logical,
            framing: input.framing,
            signal: controller.signal,
            acquire: options.presenter.acquire,
          });
          fallback = gpu.fallbackReason;
        } else fallback = 'unavailable';
      }
      if (controller?.signal.aborted || !isCurrent(input, ticket, key)) return;
      if (output === false) return;
      if (!output && !managed(input.source)) closeSource();
      options.presenter.publish(output ?? null, () => {
        if (!output && prepared)
          paintStandardBookend(options.fallbackCanvas?.(), prepared, input, size);
        options.onPresented(
          input,
          output ? { backend: 'gpu' } : { backend: 'legacy', ...(fallback ? { fallback } : {}) }
        );
      });
      accepted = true;
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
        const ticket = version,
          input = options.read(),
          key = frameKey(input);
        try {
          await paint(input, ticket);
        } catch {
          if (isCurrent(input, ticket, key)) options.onError();
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
            if (!disposed) options.onError();
          });
      }
    },
    cancel,
    reset() {
      cancel();
      resetGpu = true;
      retireProviders();
      if (!running) retire();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      retireProviders();
      gpu?.dispose();
      gpu = null;
    },
  };
}
