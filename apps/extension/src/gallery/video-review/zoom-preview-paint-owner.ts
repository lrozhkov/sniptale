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
import { zoomPreviewSourceSelection } from './use-zoom-preview-source';
import type { VideoPreviewRenderer } from '../../features/video/preview/preferences';
import {
  createZoomPreviewGpuRenderer,
  PendingZoomPreviewFrame,
  type MiniRenderer,
  type ZoomPreviewGpuInput,
} from './zoom-preview-gpu';

/** One running frame and one latest request; only owner revisions can replace a visible frame. */
export function createZoomPreviewPaintOwner(args: {
  renderer?: MiniRenderer;
  backend?: VideoPreviewRenderer;
  fallback(input: ZoomPreviewGpuInput, signal: AbortSignal): Promise<void> | void;
  publish(bitmap: ImageBitmap, input: ZoomPreviewGpuInput): void;
  onBackend(gpu: boolean): void;
  onPresented?(input: ZoomPreviewGpuInput): void;
  onError(error: unknown): void;
  requestTick?(callback: () => void): number;
  cancelTick?(id: number): void;
}) {
  const renderer =
    args.backend === 'legacy' ? null : (args.renderer ?? createZoomPreviewGpuRenderer());
  let current: ZoomPreviewGpuInput | null = null;
  let pending: ZoomPreviewGpuInput | null = null;
  let active: AbortController | null = null;
  let revision = 0;
  let disposed = false;
  let retired = false;
  let provider: PreviewSourceProvider | null = null;
  let compatible: ReturnType<typeof createPreviewHtmlSourceProvider> | null = null;
  let acquired: ZoomPreviewGpuInput['liveSource'];
  const retire = () => {
    if (disposed && !active && !retired) {
      retired = true;
      renderer?.dispose();
    }
  };
  let scheduled: number | null = null;
  let failed = false;
  let presented: {
    key: string;
    frame: CanvasImageSource | null;
    header: ZoomPreviewGpuInput['headerImage'];
  } | null = null;
  const authoringKey = (input: ZoomPreviewGpuInput) =>
    JSON.stringify([
      input.output,
      input.background,
      input.layout.videoRect,
      input.layout.windowRect,
      input.layout.sourceCrop,
      input.view,
      input.cornerRadius,
      input.previewScale,
      input.imageUrl,
      input.authoringRevision,
      !input.live && input.currentTime,
      !input.live && input.view === 'result' && input.camera,
      !input.live && input.view === 'result' && input.exposures,
      !input.live && input.lensFrames,
      !input.live && input.spotlightFrames,
      !input.live && input.borderFrames,
    ]);
  let key: string | null = null;
  let presentationIdentity: string | null = null;
  let requestedKey: string | null = null;
  const requestTick = args.requestTick ?? ((callback) => requestAnimationFrame(callback));
  const cancelTick = args.cancelTick ?? ((id) => cancelAnimationFrame(id));
  const schedule = () => {
    if (disposed || failed || scheduled !== null || !current?.live || pending || active) return;
    scheduled = requestTick(() => {
      scheduled = null;
      if (current) update(current, true);
    });
  };
  const drain = async () => {
    if (disposed || active || !pending) return;
    const input = pending;
    pending = null;
    const generation = revision;
    const controller = new AbortController();
    active = controller;
    let lease: PreparedPreviewSourceLease | null = null;
    let sample: VideoSample | undefined;
    let receipt = input;
    try {
      if (input.liveSource && typeof VideoFrame !== 'undefined') {
        const demands = [
          {
            id: 'zoom-preview',
            url: input.liveSource.url,
            time: input.liveSource.time,
            holdSourceEnd: true as const,
          },
        ];
        const discontinuity =
          !acquired ||
          acquired.url !== input.liveSource.url ||
          acquired.seekRevision !== input.liveSource.seekRevision ||
          acquired.segmentStart !== input.liveSource.segmentStart;
        if (typeof VideoDecoder !== 'undefined') {
          provider ??= createPreviewSourceProvider();
          provider.retainSources(new Set([input.liveSource.url]));
          lease = await provider.acquire(demands, controller.signal, { discontinuity });
        }
        if (!lease) {
          controller.signal.throwIfAborted();
          compatible ??= createPreviewHtmlSourceProvider();
          compatible.retainSources(new Set([input.liveSource.url]));
          lease = await compatible.acquire(demands, controller.signal);
          if (!lease) throw new Error('Inspector source binding is unavailable.');
        }
        if (disposed || generation !== revision || controller.signal.aborted) return;
        acquired = input.liveSource;
      }
      const binding = lease?.bindings.get('zoom-preview');
      if (lease && (!binding || !binding.source.toVideoFrame))
        throw new Error('Inspector source binding is unavailable.');
      if (
        binding &&
        (!input.frame ||
          binding.source.sourceWidth !== input.frame.width ||
          binding.source.sourceHeight !== input.frame.height)
      )
        throw new Error('Inspector source dimensions do not match the prepared scene.');
      if (binding)
        receipt = {
          ...input,
          sourceSelection: zoomPreviewSourceSelection(binding),
        };
      const bitmap =
        !args.renderer && (typeof navigator === 'undefined' || !navigator.gpu)
          ? null
          : binding
            ? await renderer?.render(input, controller.signal, binding.source)
            : await renderer?.render(input, controller.signal);
      try {
        if (disposed || generation !== revision || controller.signal.aborted) return;
        if (bitmap) {
          args.publish(bitmap, receipt);
          args.onBackend(true);
        } else {
          if (binding) {
            if (!binding.source.toVideoFrame)
              throw new Error('Inspector source frame is unavailable.');
            sample = await prepareDecodedVideoSample(
              new VideoSample(binding.source.toVideoFrame(), binding.source.orientation),
              controller.signal
            );
            if (disposed || generation !== revision || controller.signal.aborted) return;
            const canvas = document.createElement('canvas');
            canvas.width = binding.source.sourceWidth;
            canvas.height = binding.source.sourceHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Inspector source canvas is unavailable.');
            sample.draw(context, 0, 0, canvas.width, canvas.height);
            receipt = {
              ...receipt,
              frame: {
                image: canvas,
                width: canvas.width,
                height: canvas.height,
                ...(receipt.sourceSelection ? { selection: receipt.sourceSelection } : {}),
              },
            };
          }
          await args.fallback(receipt, controller.signal);
          if (!disposed && generation === revision && !controller.signal.aborted)
            args.onBackend(false);
        }
        if (!disposed && generation === revision && !controller.signal.aborted) {
          presented = {
            key: authoringKey(input),
            frame: receipt.frame?.image ?? null,
            header: input.headerImage,
          };
          args.onPresented?.(receipt);
        }
      } finally {
        bitmap?.close();
      }
    } catch (error) {
      if (error instanceof PendingZoomPreviewFrame) requestedKey = null;
      else if (!disposed && generation === revision && !controller.signal.aborted) {
        failed = true;
        args.onError(error);
      }
    } finally {
      sample?.close();
      lease?.release();
      active = null;
      retire();
      if (pending && !disposed) void drain();
      else schedule();
    }
  };
  const update = (input: ZoomPreviewGpuInput, clockTick = false) => {
    if (disposed) return;
    const next = authoringKey(input);
    const identity = JSON.stringify([
      input.output,
      input.view,
      !!input.live,
      input.liveSource?.url,
      input.liveSource?.seekRevision,
      input.liveSource?.segmentStart,
      input.live && input.liveSource && input.authoringRevision,
      input.frame?.width,
      input.frame?.height,
    ]);
    const temporalKey = JSON.stringify([
      next,
      input.live,
      input.liveSource,
      input.currentTime,
      input.view === 'result' && input.camera,
      input.view === 'result' && input.exposures,
      input.lensFrames,
      input.spotlightFrames,
      input.borderFrames,
      input.frame?.width,
      input.frame?.height,
    ]);
    if (
      !clockTick &&
      requestedKey === temporalKey &&
      current?.frame?.image === input.frame?.image &&
      current?.headerImage === input.headerImage
    ) {
      current = input;
      return;
    }
    requestedKey = temporalKey;
    if (
      !input.live &&
      !active &&
      !pending &&
      presented?.key === next &&
      presented.frame === (input.frame?.image ?? null) &&
      presented.header === input.headerImage
    ) {
      current = input;
      return;
    }
    const incompatible =
      presentationIdentity !== identity ||
      current?.frame?.image !== input.frame?.image ||
      current?.headerImage !== input.headerImage;
    if (incompatible) {
      revision++;
      active?.abort();
    }
    if (incompatible || key !== next) failed = false;
    if (failed) return;
    current = input;
    key = next;
    presentationIdentity = identity;
    if (
      renderer &&
      !input.frame &&
      !args.renderer &&
      typeof navigator !== 'undefined' &&
      navigator.gpu
    ) {
      pending = null;
      return;
    }
    pending = input;
    if (scheduled !== null) {
      cancelTick(scheduled);
      scheduled = null;
    }
    void drain();
  };
  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      active?.abort();
      if (scheduled !== null) cancelTick(scheduled);
      provider?.dispose();
      compatible?.dispose();
      retire();
    },
  };
}
