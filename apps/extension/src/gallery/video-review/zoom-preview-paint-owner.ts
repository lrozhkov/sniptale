import {
  createZoomPreviewGpuRenderer,
  PendingZoomPreviewFrame,
  type MiniRenderer,
  type ZoomPreviewGpuInput,
} from './zoom-preview-gpu';

/** One running frame and one latest request; only owner revisions can replace a visible frame. */
export function createZoomPreviewPaintOwner(args: {
  renderer?: MiniRenderer;
  fallback(input: ZoomPreviewGpuInput, signal: AbortSignal): Promise<void> | void;
  publish(bitmap: ImageBitmap, input: ZoomPreviewGpuInput): void;
  onBackend(gpu: boolean): void;
  onPresented?(input: ZoomPreviewGpuInput): void;
  onError(error: unknown): void;
  requestTick?(callback: () => void): number;
  cancelTick?(id: number): void;
}) {
  const renderer = args.renderer ?? createZoomPreviewGpuRenderer();
  let current: ZoomPreviewGpuInput | null = null;
  let pending: ZoomPreviewGpuInput | null = null;
  let active: AbortController | null = null;
  let revision = 0;
  let disposed = false;
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
    try {
      const bitmap =
        !args.renderer && (typeof navigator === 'undefined' || !navigator.gpu)
          ? null
          : await renderer.render(input, controller.signal);
      try {
        if (disposed || generation !== revision || controller.signal.aborted) return;
        if (bitmap) {
          args.publish(bitmap, input);
          args.onBackend(true);
        } else {
          await args.fallback(input, controller.signal);
          if (!disposed && generation === revision && !controller.signal.aborted)
            args.onBackend(false);
        }
        if (!disposed && generation === revision && !controller.signal.aborted) {
          presented = {
            key: authoringKey(input),
            frame: input.frame?.image ?? null,
            header: input.headerImage,
          };
          args.onPresented?.(input);
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
      active = null;
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
      input.frame?.width,
      input.frame?.height,
    ]);
    const temporalKey = JSON.stringify([
      next,
      input.live,
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
    if (!input.frame && !args.renderer && typeof navigator !== 'undefined' && navigator.gpu) {
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
      disposed = true;
      pending = null;
      active?.abort();
      if (scheduled !== null) cancelTick(scheduled);
      renderer.dispose();
    },
  };
}
