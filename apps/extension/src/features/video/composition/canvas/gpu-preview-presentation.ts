import type { GpuPreviewRenderer } from './gpu-preview';

type Request = Parameters<GpuPreviewRenderer['render']>[0];
type Reservation = { release(): void };

/** The frontend owns placement and publication; this surface borrows inputs until execution settles. */
export interface GpuPreviewPresentationSurface {
  readonly canvas: HTMLCanvasElement;
  present(request: Request): Promise<void>;
  /** End the frontend lease; retain the bounded idle image until replacement or retirement. */
  releaseImage?(): void;
  dispose(): void;
}

interface SurfaceEntry {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  ownedBacking: OffscreenCanvas | null;
  imageContext: ImageBitmapRenderingContext | null;
  imageHeld: boolean;
  imageLeased: boolean;
  frontendRetired: boolean;
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
  const clearOwnedBacking = (backing: OffscreenCanvas) => {
    try {
      backing.width = 0;
    } finally {
      backing.height = 0;
    }
  };
  const dropImage = (entry: SurfaceEntry) => {
    if (!entry.imageHeld) return;
    try {
      entry.imageContext?.transferFromImageBitmap(null);
    } finally {
      entry.imageHeld = false;
      entry.imageLeased = false;
    }
  };
  const retire = (entry: SurfaceEntry) => {
    if (entries.get(entry.canvas) !== entry) return;
    entry.retired = true;
    if (entry.pending) return;
    try {
      if (entry.frontendRetired || !entry.imageLeased) dropImage(entry);
    } finally {
      // Backend retirement cannot clear pixels still held by the frontend's visible lease.
      if (!entry.imageHeld) {
        try {
          releaseStorage(entry);
        } finally {
          try {
            if (entry.ownedBacking) clearOwnedBacking(entry.ownedBacking);
          } finally {
            entries.delete(entry.canvas);
          }
        }
      }
    }
  };
  const releaseImage = (entry: SurfaceEntry) => {
    if (entry.pending) throw new Error('GPU presentation image is still pending.');
    entry.imageLeased = false;
    try {
      // Replacing an idle bitmap avoids a full-size transparent transfer on every frame.
      if (entry.retired) retire(entry);
    } finally {
      if (pending === 0) options.onIdle();
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
      const backing = entry.ownedBacking ?? entry.canvas;
      if (
        backing.width !== width ||
        backing.height !== height ||
        (entry.ownedBacking && (entry.canvas.width !== width || entry.canvas.height !== height)) ||
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
      if (entry.ownedBacking && entry.imageContext) {
        // Moving a standalone GPU backing avoids asynchronous placeholder publication.
        const bitmap = entry.ownedBacking.transferToImageBitmap();
        try {
          checkTarget();
          entry.imageContext.transferFromImageBitmap(bitmap);
          entry.imageHeld = true;
          entry.imageLeased = true;
        } finally {
          bitmap.close();
        }
      }
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
    create(
      canvas: HTMLCanvasElement,
      settings: { offscreen?: boolean } = {}
    ): GpuPreviewPresentationSurface {
      if (disposed) throw new Error('GPU presentation owner is disposed.');
      if (entries.has(canvas)) throw new Error('GPU presentation canvas already has an owner.');
      if (entries.size >= options.maximumSurfaces)
        throw new Error('GPU presentation surface capacity exceeded.');
      let ownedBacking: OffscreenCanvas | null = null;
      let imageContext: ImageBitmapRenderingContext | null = null;
      let context: GPUCanvasContext;
      if (settings.offscreen) {
        if (
          !Number.isSafeInteger(canvas.width) ||
          !Number.isSafeInteger(canvas.height) ||
          canvas.width < 1 ||
          canvas.height < 1 ||
          canvas.width > options.device.limits.maxTextureDimension2D ||
          canvas.height > options.device.limits.maxTextureDimension2D
        )
          throw new Error('GPU presentation dimensions are invalid.');
        try {
          ownedBacking = new OffscreenCanvas(canvas.width, canvas.height);
          const resolved = ownedBacking.getContext('webgpu');
          if (!resolved || !('configure' in resolved)) throw options.unavailable();
          context = resolved;
          imageContext = canvas.getContext('bitmaprenderer');
          if (!imageContext) throw options.unavailable();
        } catch {
          try {
            if (ownedBacking) clearOwnedBacking(ownedBacking);
          } catch {
            throw options.unavailable();
          }
          throw options.unavailable();
        }
      } else {
        const resolved = canvas.getContext('webgpu');
        if (!resolved || !('configure' in resolved)) throw options.unavailable();
        context = resolved;
      }
      const entry: SurfaceEntry = {
        canvas,
        context,
        ownedBacking,
        imageContext,
        imageHeld: false,
        imageLeased: false,
        frontendRetired: false,
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
        ...(imageContext ? { releaseImage: () => releaseImage(entry) } : {}),
        dispose: () => {
          entry.frontendRetired = true;
          try {
            retire(entry);
          } finally {
            if (pending === 0) options.onIdle();
          }
        },
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
