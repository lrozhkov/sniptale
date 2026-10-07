const MAX_HOLD_US = 200_000;

type PendingFrame = { pixels: ImageData; start: number; end: number };

/** Coalesces exact final pixels, retaining a bounded snapshot until its duration is known. */
export function createAdaptiveFrameWriter(
  context: CanvasRenderingContext2D,
  emit: (canvas: HTMLCanvasElement, timestampUs: number, durationUs: number) => Promise<void>,
  signal?: AbortSignal
) {
  const canvas = context.canvas.ownerDocument.createElement('canvas');
  canvas.width = context.canvas.width;
  canvas.height = context.canvas.height;
  const snapshot = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!snapshot) throw new Error('Adaptive export canvas is unavailable.');
  let pending: PendingFrame | null = null;
  let lastEnd = -1;
  let disposed = false;
  const check = () => {
    signal?.throwIfAborted();
    if (disposed) throw new Error('Adaptive export frame writer is disposed.');
  };
  const flush = async () => {
    check();
    const frame = pending;
    if (!frame) return;
    pending = null;
    snapshot.putImageData(frame.pixels, 0, 0);
    await emit(canvas, frame.start, frame.end - frame.start);
    check();
  };
  return {
    async add(timestampUs: number, durationUs: number) {
      check();
      if (
        !Number.isSafeInteger(timestampUs) ||
        timestampUs < 0 ||
        !Number.isSafeInteger(durationUs) ||
        durationUs <= 0 ||
        durationUs > MAX_HOLD_US ||
        timestampUs < lastEnd
      )
        throw new Error('Invalid adaptive export frame timing.');
      if (context.canvas.width !== canvas.width || context.canvas.height !== canvas.height)
        throw new Error('Adaptive export dimensions changed.');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const end = timestampUs + durationUs;
      if (
        pending &&
        pending.end === timestampUs &&
        end - pending.start <= MAX_HOLD_US &&
        samePixels(pending.pixels.data, pixels.data)
      ) {
        pending.end = end;
      } else {
        await flush();
        pending = { pixels, start: timestampUs, end };
      }
      lastEnd = end;
    },
    flush,
    dispose() {
      disposed = true;
      pending = null;
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

function samePixels(left: Uint8ClampedArray, right: Uint8ClampedArray): boolean {
  if (left.length !== right.length) return false;
  const a = new Uint32Array(left.buffer, left.byteOffset, left.byteLength / 4);
  const b = new Uint32Array(right.buffer, right.byteOffset, right.byteLength / 4);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
