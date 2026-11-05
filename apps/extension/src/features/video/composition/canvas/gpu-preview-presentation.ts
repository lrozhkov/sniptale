import type { GpuPreviewRenderer } from './gpu-preview';

type Request = Parameters<GpuPreviewRenderer['render']>[0];
type Reservation = { release(): void };

/** The frontend owns placement and publication; this surface borrows inputs until execution settles. */
export interface GpuPreviewPresentationSurface {
  readonly canvas: HTMLCanvasElement;
  present(request: Request): Promise<void>;
  dispose(): void;
}

interface SurfaceEntry {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  width: number;
  height: number;
  bytes: number;
  reservation: Reservation | undefined;
  configured: boolean;
  pending: boolean;
  retired: boolean;
}

/** Owns bounded destination contexts, without choosing the visible frontend surface. */
export function createGpuPreviewPresentationOwner(options: {
  device: GPUDevice;
  format: GPUTextureFormat;
  maximumSurfaces: number;
  maximumBytes: number;
  reserve?: (bytes: number) => Reservation;
  check: (signal: AbortSignal) => void;
  execute: (request: Request, getTexture: () => GPUTexture) => Promise<void>;
  onIdle: () => void;
  unavailable: () => Error;
}) {
  if (
    !Number.isSafeInteger(options.maximumSurfaces) ||
    options.maximumSurfaces < 1 ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 0
  )
    throw new Error('GPU presentation limits are invalid.');
  const entries = new Map<HTMLCanvasElement, SurfaceEntry>();
  let disposed = false;
  let pending = 0;
  let allocatedBytes = 0;
  const releaseStorage = (entry: SurfaceEntry) => {
    try {
      if (entry.configured) entry.context.unconfigure();
    } finally {
      entry.configured = false;
      allocatedBytes -= entry.bytes;
      entry.bytes = 0;
      const reservation = entry.reservation;
      entry.reservation = undefined;
      reservation?.release();
    }
  };
  const retire = (entry: SurfaceEntry) => {
    if (entries.get(entry.canvas) !== entry) return;
    entry.retired = true;
    if (!entry.pending) {
      try {
        releaseStorage(entry);
      } finally {
        entries.delete(entry.canvas);
      }
    }
  };
  const configure = (entry: SurfaceEntry, width: number, height: number) => {
    if (entry.configured && entry.width === width && entry.height === height) return;
    const bytes = width * height * 8;
    if (!Number.isSafeInteger(bytes) || allocatedBytes - entry.bytes + bytes > options.maximumBytes)
      throw new Error('GPU presentation storage budget exceeded.');
    releaseStorage(entry);
    const reservation = options.reserve?.(bytes);
    entry.reservation = reservation;
    entry.bytes = bytes;
    allocatedBytes += bytes;
    try {
      entry.context.configure({
        device: options.device,
        format: options.format,
        alphaMode: 'premultiplied',
      });
      entry.configured = true;
      entry.width = width;
      entry.height = height;
    } catch (error) {
      // A failed configure can leave partial context state; its storage never becomes reusable.
      entry.configured = true;
      releaseStorage(entry);
      throw error;
    }
  };
  const present = async (entry: SurfaceEntry, request: Request) => {
    if (disposed || entry.retired) throw new Error('GPU presentation surface is disposed.');
    if (entry.pending) throw new Error('GPU presentation surface already has a frame in flight.');
    options.check(request.signal);
    const { width, height } = request.output;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > options.device.limits.maxTextureDimension2D ||
      height > options.device.limits.maxTextureDimension2D
    )
      throw new Error('GPU presentation dimensions are invalid.');
    const checkTarget = () => {
      options.check(request.signal);
      if (disposed || entry.retired) throw new Error('GPU presentation surface is disposed.');
      if (
        entry.canvas.width !== width ||
        entry.canvas.height !== height ||
        request.output.width !== width ||
        request.output.height !== height
      )
        throw new Error('GPU presentation backing size changed.');
    };
    checkTarget();
    entry.pending = true;
    pending++;
    try {
      let acquired = false;
      await options.execute(request, () => {
        checkTarget();
        configure(entry, width, height);
        checkTarget();
        const texture = entry.context.getCurrentTexture();
        checkTarget();
        acquired = true;
        return texture;
      });
      checkTarget();
      if (!acquired) throw new Error('GPU presentation destination was not acquired.');
    } finally {
      entry.pending = false;
      pending--;
      try {
        if (entry.retired) retire(entry);
      } finally {
        if (pending === 0) options.onIdle();
      }
    }
  };
  return {
    get pending() {
      return pending;
    },
    get allocatedBytes() {
      return allocatedBytes;
    },
    create(canvas: HTMLCanvasElement): GpuPreviewPresentationSurface {
      if (disposed) throw new Error('GPU presentation owner is disposed.');
      if (entries.has(canvas)) throw new Error('GPU presentation canvas already has an owner.');
      if (entries.size >= options.maximumSurfaces)
        throw new Error('GPU presentation surface capacity exceeded.');
      const context = canvas.getContext('webgpu');
      if (!context || !('configure' in context)) throw options.unavailable();
      const entry: SurfaceEntry = {
        canvas,
        context,
        width: 0,
        height: 0,
        bytes: 0,
        reservation: undefined,
        configured: false,
        pending: false,
        retired: false,
      };
      entries.set(canvas, entry);
      return {
        canvas,
        present: (request) => present(entry, request),
        dispose: () => retire(entry),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        for (const entry of entries.values()) retire(entry);
      } finally {
        if (pending === 0) options.onIdle();
      }
    },
  };
}
