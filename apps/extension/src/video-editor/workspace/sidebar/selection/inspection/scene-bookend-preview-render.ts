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
    size: Size;
    ready: boolean;
  };
  framing: BookendMediaFraming;
  logical: Size;
  renderer: VideoPreviewRenderer;
}
interface Snapshot {
  element: Media;
  key: string;
  url: string;
  time: number;
  pixels: ImageBitmap;
}

function ready(
  source: BookendPreviewFrameInput['source']
): source is BookendPreviewFrameInput['source'] & { element: Media; url: string } {
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
    snapshot.element === input.source.element &&
    snapshot.key === input.source.key &&
    snapshot.url === input.source.url &&
    snapshot.time === input.source.time
  );
}
function frameKey(input: BookendPreviewFrameInput) {
  return JSON.stringify([
    input.source.key,
    input.source.url,
    input.source.time,
    input.source.size,
    input.framing,
    input.logical,
    input.renderer,
  ]);
}

/** Serial GPU work retains one source snapshot while framing changes, plus one latest request. */
export function createBookendPreviewFrameQueue(options: {
  stage: HTMLDivElement;
  presenter: GpuPreviewFramePresenter;
  read(): BookendPreviewFrameInput;
  onPresented(input: BookendPreviewFrameInput, status: PreviewRendererStatus): void;
  onError(): void;
  createRenderer?: typeof createBookendPreviewGpuRenderer;
}) {
  let gpu: ReturnType<typeof createBookendPreviewGpuRenderer> | null = null;
  let cached: Snapshot | null = null;
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
    if (!running) retire();
  };
  const capture = async (input: BookendPreviewFrameInput): Promise<Snapshot | undefined> => {
    if (cached && matches(cached, input)) return cached;
    closeSource();
    const source = input.source;
    if (!ready(source)) return undefined;
    if (typeof createImageBitmap === 'undefined') return undefined;
    // This paused source becomes one retained RGB material, rather than a YUV pass per framing edit.
    const pixels = await createImageBitmap(source.element);
    const snapshot = {
      element: source.element,
      key: source.key,
      url: source.url,
      time: source.time,
      pixels,
    };
    if (disposed || !matches(snapshot, options.read())) {
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
      current.source.element === input.source.element &&
      frameKey(current) === key
    );
  };
  const paint = async (input: BookendPreviewFrameInput, ticket: number) => {
    if (!ready(input.source)) return;
    const box = options.stage.getBoundingClientRect();
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const size = {
      width: Math.max(1, Math.round(box.width * scale)),
      height: Math.max(1, Math.round(box.height * scale)),
    };
    const key = frameKey(input);
    let output: GpuPreviewOutput | undefined | false;
    let accepted = false;
    let fallback: PreviewRendererStatus['fallback'];
    try {
      if (input.renderer === 'legacy') {
        gpu?.dispose();
        gpu = null;
        closeSource();
      } else if (gpu?.fallbackReason) {
        fallback = gpu.fallbackReason;
      } else {
        const source = await capture(input);
        if (disposed || ticket !== version) return;
        if (source) {
          controller = new AbortController();
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
      if (!output) closeSource();
      options.presenter.publish(output ?? null, () =>
        options.onPresented(
          input,
          output ? { backend: 'gpu' } : { backend: 'legacy', ...(fallback ? { fallback } : {}) }
        )
      );
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
      if (!running) retire();
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
