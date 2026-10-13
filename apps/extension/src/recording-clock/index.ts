import {
  normalizeRecordingFrameClockLease,
  type RecordingFrameClockLease,
  RECORDING_FRAME_CLOCK_PROBE_MS,
} from '../contracts/video/recording-frame-clock';
import { openRecordingFrameClockPort } from '../platform/media-utils/recording-frame-clock-client';

type NativeVideoGenerator = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
type NativeVideoGeneratorConstructor = new (options: { kind: 'video' }) => NativeVideoGenerator;
const MAX_NATIVE_RGBA_BYTES = 64 * 1024 * 1024;

function nativeRgbaSize(frame: VideoFrame): number {
  const { displayWidth, displayHeight } = frame;
  const pixels = displayWidth * displayHeight;
  const bytes = pixels * 4;
  if (
    !Number.isSafeInteger(displayWidth) ||
    !Number.isSafeInteger(displayHeight) ||
    displayWidth <= 0 ||
    displayHeight <= 0 ||
    !Number.isSafeInteger(pixels) ||
    !Number.isSafeInteger(bytes) ||
    bytes > MAX_NATIVE_RGBA_BYTES
  )
    throw new Error('Native frame identity exceeds its pixel budget');
  const size = frame.allocationSize({ format: 'RGBA' });
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_NATIVE_RGBA_BYTES)
    throw new Error('Native frame identity allocation is unavailable');
  return size;
}

/** Sole immutable input ownership supplies temporal identity; this checks native pixels only. */
async function hasSameNativePixels(source: VideoFrame, presented: VideoFrame): Promise<boolean> {
  const sourceSize = nativeRgbaSize(source);
  const presentedSize = nativeRgbaSize(presented);
  if (sourceSize !== presentedSize || typeof crypto?.subtle?.digest !== 'function') return false;
  const digest = async (frame: VideoFrame, size: number) => {
    const bytes = new Uint8Array(size);
    await frame.copyTo(bytes, { format: 'RGBA' });
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  };
  const [sourceDigest, presentedDigest] = await Promise.all([
    digest(source, sourceSize),
    digest(presented, presentedSize),
  ]);
  return sourceDigest.every((value, index) => value === presentedDigest[index]);
}

/** Recover original native capture metadata from this exact frame, never its injection time. */
export async function recoverRecordingFrameCaptureEpoch(
  frame: VideoFrame,
  signal: AbortSignal,
  ownerDocument = document
): Promise<number> {
  return new NativeCaptureEpochProbe(frame, signal, ownerDocument).run();
}

/** One owner acquires, settles and releases all resources for a bounded native presentation. */
class NativeCaptureEpochProbe {
  private generator: NativeVideoGenerator | null = null;
  private writer: WritableStreamDefaultWriter<VideoFrame> | null = null;
  private retained: VideoFrame | null = null;
  private video: HTMLVideoElement | null = null;
  private readonly snapshots: VideoFrame[] = [];
  private callbackObserved = false;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private callbackId: number | null = null;
  private repeat: ReturnType<typeof setTimeout> | null = null;
  private frameTransferred = false;
  private finished = false;
  private source: { timestamp: number; width: number; height: number } | null = null;
  private completion: { resolve(value: number): void; reject(error: Error): void } | null = null;
  constructor(
    private readonly frame: VideoFrame,
    private readonly signal: AbortSignal,
    private readonly ownerDocument: Document
  ) {}

  async run(): Promise<number> {
    const native = globalThis as typeof globalThis & {
      MediaStreamTrackGenerator?: NativeVideoGeneratorConstructor;
    };
    if (!native.MediaStreamTrackGenerator || this.signal.aborted) {
      this.frame.close();
      throw new Error('Native frame clock is unavailable');
    }
    try {
      this.initialize(native.MediaStreamTrackGenerator);
      return await this.waitForCapture();
    } finally {
      await this.dispose();
    }
  }

  private initialize(Generator: NativeVideoGeneratorConstructor): void {
    this.generator = new Generator({ kind: 'video' });
    this.writer = this.generator.writable.getWriter();
    this.retained = this.frame.clone();
    this.source = {
      timestamp: this.frame.timestamp,
      width: this.frame.displayWidth,
      height: this.frame.displayHeight,
    };
    const video = this.ownerDocument.createElement('video');
    this.video = video;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    video.srcObject = new MediaStream([this.generator]);
    this.ownerDocument.body.append(video);
  }

  private readonly cancel = () => this.settle(null);
  private settle(epoch: number | null): void {
    if (this.finished) return;
    this.finished = true;
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.signal.removeEventListener('abort', this.cancel);
    if (epoch === null)
      this.completion?.reject(new Error('Exact native capture metadata is unavailable'));
    else this.completion?.resolve(epoch);
  }

  private waitForCapture(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.completion = { resolve, reject };
      this.deadline = setTimeout(this.cancel, RECORDING_FRAME_CLOCK_PROBE_MS);
      this.signal.addEventListener('abort', this.cancel, { once: true });
      const video = this.video!;
      if (typeof video.requestVideoFrameCallback !== 'function') {
        this.settle(null);
        return;
      }
      this.callbackId = video.requestVideoFrameCallback((_now, metadata) =>
        this.observePresentation(metadata)
      );
      void video.play().catch(this.cancel);
      this.frameTransferred = true;
      void this.writeOriginal(this.frame, 5);
    });
  }

  private observePresentation(metadata: VideoFrameCallbackMetadata): void {
    if (this.finished || this.callbackObserved) return;
    this.callbackObserved = true;
    try {
      const sample = new VideoFrame(this.video!);
      this.snapshots.push(sample);
      const source = this.source!;
      const captureTime = metadata.captureTime;
      const sameVideo =
        sample.timestamp === Math.round(metadata.mediaTime * 1_000_000) &&
        sample.displayWidth === source.width &&
        sample.displayHeight === source.height;
      const epoch = typeof captureTime === 'number' ? performance.timeOrigin + captureTime : NaN;
      if (!sameVideo || !Number.isFinite(epoch) || epoch <= 0) {
        this.settle(null);
        return;
      }
      if (sample.timestamp === source.timestamp) {
        this.settle(epoch);
        return;
      }
      // Only the immutable original input and unchanged clones entered this generator.
      void hasSameNativePixels(this.retained!, sample).then(
        (same) => this.settle(same ? epoch : null),
        this.cancel
      );
    } catch {
      this.settle(null);
    }
  }

  private async writeOriginal(next: VideoFrame, remaining: number): Promise<void> {
    if (this.finished) {
      next.close();
      return;
    }
    try {
      await this.writer!.write(next);
      if (!this.finished && remaining > 0)
        this.repeat = setTimeout(() => {
          void this.writeOriginal(this.retained!.clone(), remaining - 1);
        }, 40);
    } catch {
      next.close();
      this.settle(null);
    }
  }

  private async dispose(): Promise<void> {
    this.finished = true;
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.signal.removeEventListener('abort', this.cancel);
    if (this.repeat !== null) clearTimeout(this.repeat);
    if (this.callbackId !== null) this.video?.cancelVideoFrameCallback(this.callbackId);
    if (!this.frameTransferred) this.frame.close();
    this.retained?.close();
    this.snapshots.forEach((sample) => sample.close());
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
    }
    this.generator?.stop();
    await this.writer?.abort().catch(() => undefined);
    this.writer?.releaseLock();
  }
}

export async function runRecordingFrameClockRenderer(hash = location.hash): Promise<void> {
  const lease = leaseFromHash(hash);
  if (!lease || lease.expiresAtEpochMs <= Date.now()) return;
  const cancellation = new AbortController();
  const timeout = setTimeout(() => cancellation.abort(), lease.expiresAtEpochMs - Date.now());
  const pageClosed = () => cancellation.abort();
  window.addEventListener('pagehide', pageClosed, { once: true });
  let connection: Awaited<ReturnType<typeof openRecordingFrameClockPort>> | null = null;
  try {
    connection = await openRecordingFrameClockPort(lease, 'renderer', cancellation.signal);
    await serveRecordingClockFrames(connection.port, lease, cancellation);
  } catch {
    /* Optional observer failure has no primary recording side effect. */
  } finally {
    clearTimeout(timeout);
    window.removeEventListener('pagehide', pageClosed);
    cancellation.abort();
    connection?.close();
  }
}

function leaseFromHash(hash: string): RecordingFrameClockLease | null {
  try {
    return normalizeRecordingFrameClockLease(JSON.parse(decodeURIComponent(hash.slice(1))));
  } catch {
    return null;
  }
}

function acceptsFrameEnvelope(
  event: MessageEvent<unknown>,
  lease: RecordingFrameClockLease,
  frame: VideoFrame
): boolean {
  const data = event.data;
  return (
    typeof data === 'object' &&
    data !== null &&
    event.ports.length === 0 &&
    lease.expiresAtEpochMs > Date.now() &&
    'type' in data &&
    data.type === 'frame' &&
    'nonce' in data &&
    data.nonce === lease.nonce &&
    'sourceTimestampUs' in data &&
    data.sourceTimestampUs === frame.timestamp &&
    Object.keys(data).every((key) => ['type', 'nonce', 'sourceTimestampUs', 'frame'].includes(key))
  );
}

async function serveRecordingClockFrames(
  port: MessagePort,
  lease: RecordingFrameClockLease,
  cancellation: AbortController
): Promise<void> {
  let received = false;
  await new Promise<void>((resolve) => {
    const finish = () => {
      cancellation.abort();
      resolve();
    };
    cancellation.signal.addEventListener('abort', () => resolve(), { once: true });
    port.onmessageerror = finish;
    port.onmessage = (event: MessageEvent<unknown>) => {
      const receivedAtMs = performance.timeOrigin + performance.now();
      const data = event.data;
      const releaseIncoming = () => event.ports.forEach((handle) => handle.close());
      if (
        typeof data !== 'object' ||
        data === null ||
        !('frame' in data) ||
        !(data.frame instanceof VideoFrame)
      ) {
        releaseIncoming();
        finish();
        return;
      }
      const frame = data.frame;
      if (received || !acceptsFrameEnvelope(event, lease, frame)) {
        releaseIncoming();
        frame.close();
        finish();
        return;
      }
      received = true;
      const sourceTimestampUs = frame.timestamp;
      void recoverRecordingFrameCaptureEpoch(frame, cancellation.signal).then(
        (captureEpochMs) => {
          if (!cancellation.signal.aborted)
            port.postMessage({
              type: 'result',
              nonce: lease.nonce,
              sourceTimestampUs,
              captureEpochMs,
              receivedAtMs,
              repliedAtMs: performance.timeOrigin + performance.now(),
            });
          finish();
        },
        () => {
          if (!cancellation.signal.aborted) port.postMessage({ type: 'unavailable' });
          finish();
        }
      );
    };
    port.postMessage({ type: 'ready', nonce: lease.nonce });
  });
}

if (typeof window !== 'undefined') void runRecordingFrameClockRenderer();
