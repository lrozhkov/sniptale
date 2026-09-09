import { createVideoCompositionBufferCanvas } from './buffer-canvas';

type BufferCanvas = HTMLCanvasElement | OffscreenCanvas;
interface IdleBuffer {
  canvas: BufferCanvas;
  ownerDocument: Document | null | undefined;
  timer: ReturnType<typeof setTimeout>;
  bytes: number;
}

const idleBuffers: IdleBuffer[] = [];
const MAX_IDLE_BYTES = 64 * 1024 * 1024;
const MAX_IDLE_BUFFERS = 4;
const IDLE_RELEASE_MS = 1000;

function discard(entry: IdleBuffer) {
  clearTimeout(entry.timer);
  const index = idleBuffers.indexOf(entry);
  if (index >= 0) idleBuffers.splice(index, 1);
  entry.canvas.width = 0;
  entry.canvas.height = 0;
}

/** Scratch surfaces are leased exclusively and retain no pixels after one second of inactivity. */
export function acquireVideoCompositionBuffer(
  width: number,
  height: number,
  ownerDocument?: Document | null
): { canvas: BufferCanvas; release(): void } | null {
  width = Math.ceil(width);
  height = Math.ceil(height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    return null;
  const index = idleBuffers.findIndex(
    (entry) =>
      entry.canvas.width === width &&
      entry.canvas.height === height &&
      entry.ownerDocument === ownerDocument
  );
  const existing = index >= 0 ? idleBuffers.splice(index, 1)[0] : undefined;
  if (existing) clearTimeout(existing.timer);
  const canvas =
    existing?.canvas ?? createVideoCompositionBufferCanvas(width, height, ownerDocument);
  if (!canvas) return null;
  let released = false;
  return {
    canvas,
    release() {
      if (released) return;
      released = true;
      const bytes = width * height * 4;
      if (bytes > MAX_IDLE_BYTES) {
        canvas.width = 0;
        canvas.height = 0;
        return;
      }
      while (
        idleBuffers.length >= MAX_IDLE_BUFFERS ||
        idleBuffers.reduce((sum, entry) => sum + entry.bytes, 0) + bytes > MAX_IDLE_BYTES
      ) {
        const oldest = idleBuffers[0];
        if (!oldest) break;
        discard(oldest);
      }
      const entry: IdleBuffer = {
        canvas,
        ownerDocument,
        bytes,
        timer: setTimeout(() => discard(entry), IDLE_RELEASE_MS),
      };
      idleBuffers.push(entry);
    },
  };
}
