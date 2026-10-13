// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  RECORDING_FRAME_CLOCK_PROBE_MS,
  RECORDING_FRAME_CLOCK_PURPOSE,
} from '../contracts/video/recording-frame-clock';
const rendezvous = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../platform/media-utils/recording-frame-clock-client', () => ({
  openRecordingFrameClockPort: rendezvous.open,
}));
import { recoverRecordingFrameCaptureEpoch, runRecordingFrameClockRenderer } from './index';

class NativeFrame {
  static created: NativeFrame[] = [];
  static videoSample = { timestamp: 100000, displayWidth: 160, displayHeight: 90 };
  static rejectVideoSample = false;
  static sourcePixelValue = 17;
  static videoPixelValue = 17;
  static rejectCopy = false;
  static allocationOverride: number | null = null;
  readonly pixelValue: number;
  readonly timestamp: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  closed = false;
  close = vi.fn(() => {
    this.closed = true;
  });
  clone = vi.fn(() => {
    if (this.closed) throw new Error('Frame is closed');
    return new NativeFrame(this);
  });
  allocationSize = vi.fn(
    () => NativeFrame.allocationOverride ?? this.displayWidth * this.displayHeight * 4
  );
  copyTo = vi.fn(async (destination: AllowSharedBufferSource) => {
    if (NativeFrame.rejectCopy) throw new Error('Native copy unavailable');
    const bytes = ArrayBuffer.isView(destination)
      ? new Uint8Array(destination.buffer, destination.byteOffset, destination.byteLength)
      : new Uint8Array(destination);
    bytes.fill(this.pixelValue);
    return [{ offset: 0, stride: this.displayWidth * 4 }];
  });
  constructor(
    source: { timestamp: number; displayWidth: number; displayHeight: number } | HTMLVideoElement
  ) {
    if (source instanceof HTMLVideoElement && NativeFrame.rejectVideoSample)
      throw new Error('Native video frame unavailable');
    const value = source instanceof HTMLVideoElement ? NativeFrame.videoSample : source;
    this.pixelValue =
      source instanceof HTMLVideoElement
        ? NativeFrame.videoPixelValue
        : source instanceof NativeFrame
          ? source.pixelValue
          : NativeFrame.sourcePixelValue;
    this.timestamp = value.timestamp;
    this.displayWidth = value.displayWidth;
    this.displayHeight = value.displayHeight;
    NativeFrame.created.push(this);
  }
}
class NativeGenerator {
  static created: NativeGenerator[] = [];
  stop = vi.fn();
  writer = {
    write: vi.fn(async (frame: NativeFrame) => {
      frame.close();
    }),
    abort: vi.fn(async () => undefined),
    releaseLock: vi.fn(),
  };
  writable = { getWriter: () => this.writer };
  constructor(_options: { kind: 'video' }) {
    NativeGenerator.created.push(this);
  }
}
class RendererPort extends EventTarget implements MessagePort {
  onmessage: MessagePort['onmessage'] = null;
  onmessageerror: MessagePort['onmessageerror'] = null;
  start = vi.fn();
  close = vi.fn();
  postMessage = vi.fn(
    (_data: unknown, _transfer?: Transferable[] | StructuredSerializeOptions) => undefined
  );
  send(data: unknown, ports: MessagePort[] = []) {
    const event = new MessageEvent<unknown>('message', { data });
    Object.defineProperty(event, 'ports', { value: ports });
    this.onmessage?.call(this, event);
  }
}
let callback: VideoFrameRequestCallback | null;
let video: HTMLVideoElement;
let cancelCallback: ReturnType<typeof vi.fn>;
function metadata(): VideoFrameCallbackMetadata {
  return {
    presentationTime: 0,
    expectedDisplayTime: 0,
    width: 160,
    height: 90,
    mediaTime: 0.1,
    presentedFrames: 1,
    captureTime: 500,
  };
}
function emit(value = metadata()) {
  if (!callback) throw new Error('Native callback was not registered');
  callback(9000, value);
}
function frame(): VideoFrame {
  return new NativeFrame(NativeFrame.videoSample) as unknown as VideoFrame;
}
async function assertDisposed() {
  await vi.advanceTimersByTimeAsync(0);
  for (const handle of NativeFrame.created) expect(handle.close).toHaveBeenCalledTimes(1);
  for (const generator of NativeGenerator.created) {
    expect(generator.stop).toHaveBeenCalledTimes(1);
    expect(generator.writer.abort).toHaveBeenCalledTimes(1);
    expect(generator.writer.releaseLock).toHaveBeenCalledTimes(1);
  }
  expect(video.pause).toHaveBeenCalledTimes(1);
  expect(video.remove).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
}
function leaseHash(patch: Record<string, unknown> = {}) {
  const value = {
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    recordingId: 'recording',
    generation: 3,
    streamInstanceId: 'source',
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    expiresAtEpochMs: 2000,
    ...patch,
  };
  return `#${encodeURIComponent(JSON.stringify(value))}`;
}
async function renderer() {
  const port = new RendererPort();
  const close = vi.fn();
  rendezvous.open.mockResolvedValue({ port, close });
  const pending = runRecordingFrameClockRenderer(leaseHash());
  await Promise.resolve();
  expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({
    type: 'ready',
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
  });
  return { port, close, pending };
}
function packet(owned: VideoFrame, patch: Record<string, unknown> = {}) {
  return {
    type: 'frame',
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    sourceTimestampUs: owned.timestamp,
    frame: owned,
    ...patch,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  rendezvous.open.mockReset();
  callback = null;
  NativeFrame.created = [];
  NativeGenerator.created = [];
  NativeFrame.rejectVideoSample = false;
  NativeFrame.sourcePixelValue = 17;
  NativeFrame.videoPixelValue = 17;
  NativeFrame.rejectCopy = false;
  NativeFrame.allocationOverride = null;
  vi.stubGlobal('crypto', webcrypto);
  NativeFrame.videoSample = { timestamp: 100000, displayWidth: 160, displayHeight: 90 };
  vi.stubGlobal('VideoFrame', NativeFrame);
  vi.stubGlobal('MediaStreamTrackGenerator', NativeGenerator);
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(_tracks: unknown[]) {}
    }
  );
  vi.stubGlobal('performance', { timeOrigin: 10000, now: () => 1000 });
  video = document.createElement('video');
  cancelCallback = vi.fn();
  Object.defineProperty(video, 'requestVideoFrameCallback', {
    configurable: true,
    value: vi.fn((next: VideoFrameRequestCallback) => {
      callback = next;
      return 42;
    }),
  });
  Object.defineProperty(video, 'cancelVideoFrameCallback', {
    configurable: true,
    value: cancelCallback,
  });
  vi.spyOn(video, 'play').mockResolvedValue(undefined);
  vi.spyOn(video, 'pause').mockImplementation(() => undefined);
  vi.spyOn(video, 'remove');
  vi.spyOn(document, 'createElement').mockImplementation(() => video);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([500, -400])(
  'uses exact native captureTime %s rather than delayed renderer receipt',
  async (captureTime) => {
    const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(80);
    emit({ ...metadata(), captureTime });
    await expect(pending).resolves.toBe(10000 + captureTime);
    expect(cancelCallback).toHaveBeenCalledExactlyOnceWith(42);
    await assertDisposed();
  }
);

it.each([
  'missing captureTime',
  'nonfinite captureTime',
  'wrong video mediaTime',
  'different native timestamp',
  'different native dimensions',
] as const)('refuses %s without substituting any clock', async (cause) => {
  const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
  const refusal = expect(pending).rejects.toThrow();
  const value = metadata();
  if (cause === 'missing captureTime') delete value.captureTime;
  if (cause === 'nonfinite captureTime') value.captureTime = Infinity;
  if (cause === 'wrong video mediaTime') value.mediaTime = 0.2;
  if (cause === 'different native timestamp')
    NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 200000 };
  if (cause === 'different native dimensions')
    NativeFrame.videoSample = { ...NativeFrame.videoSample, displayWidth: 320 };
  emit(value);
  await refusal;
  await assertDisposed();
});

it('replays only the unchanged native frame a bounded number of times and closes every clone on timeout', async () => {
  const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
  const refusal = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(300);
  const written = NativeGenerator.created[0]!.writer.write.mock.calls.map(([value]) => value);
  expect(written).toHaveLength(6);
  expect(
    written.every(
      (value) =>
        value.timestamp === 100000 && value.displayWidth === 160 && value.displayHeight === 90
    )
  ).toBe(true);
  await vi.advanceTimersByTimeAsync(RECORDING_FRAME_CLOCK_PROBE_MS);
  await refusal;
  await assertDisposed();
});

it('aborts the native probe once and clears callbacks, retries and writer resources', async () => {
  const cancellation = new AbortController();
  const pending = recoverRecordingFrameCaptureEpoch(frame(), cancellation.signal);
  const refusal = expect(pending).rejects.toThrow();
  cancellation.abort();
  cancellation.abort();
  await refusal;
  await assertDisposed();
});

it('releases the received native frame when generator construction fails', async () => {
  vi.stubGlobal(
    'MediaStreamTrackGenerator',
    class {
      constructor() {
        throw new Error('Native generator unavailable');
      }
    }
  );
  const owned = frame();
  await expect(
    recoverRecordingFrameCaptureEpoch(owned, new AbortController().signal)
  ).rejects.toThrow();
  expect(NativeFrame.created[0]!.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases acquired generator/writer handles when a closed frame cannot be cloned', async () => {
  const owned = frame();
  owned.close();
  // A detached incoming handle remains safe to close; count this receiver's cleanup only.
  NativeFrame.created[0]!.close.mockClear();
  await expect(
    recoverRecordingFrameCaptureEpoch(owned, new AbortController().signal)
  ).rejects.toThrow();
  expect(NativeFrame.created[0]!.close).toHaveBeenCalledTimes(1);
  for (const generator of NativeGenerator.created) {
    expect(generator.stop).toHaveBeenCalledTimes(1);
    expect(generator.writer.abort).toHaveBeenCalledTimes(1);
    expect(generator.writer.releaseLock).toHaveBeenCalledTimes(1);
  }
  expect(vi.getTimerCount()).toBe(0);
});

it('clears deadline and native resources when callback registration throws', async () => {
  Object.defineProperty(video, 'requestVideoFrameCallback', {
    configurable: true,
    value: () => {
      throw new Error('Renderer disconnected');
    },
  });
  await expect(
    recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal)
  ).rejects.toThrow();
  await assertDisposed();
});

it('refuses unavailable native VideoFrame sampling without leaving source or generated frames open', async () => {
  NativeFrame.rejectVideoSample = true;
  const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
  const refusal = expect(pending).rejects.toThrow();
  emit();
  await refusal;
  await assertDisposed();
});

it.each(['wrong nonce', 'wrong raw timestamp', 'extra source field'] as const)(
  'rejects a %s native envelope before creating media resources',
  async (cause) => {
    const run = await renderer();
    const owned = frame();
    const patch =
      cause === 'wrong nonce'
        ? { nonce: 'other' }
        : cause === 'wrong raw timestamp'
          ? { sourceTimestampUs: 200000 }
          : { generation: 100 };
    run.port.send(packet(owned, patch));
    await run.pending;
    expect(NativeFrame.created[0]!.close).toHaveBeenCalledTimes(1);
    expect(NativeGenerator.created).toHaveLength(0);
    expect(run.port.postMessage).toHaveBeenCalledTimes(1);
    expect(run.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('rejects unsolicited transferred ports at the native-frame envelope boundary', async () => {
  const run = await renderer();
  const owned = frame();
  const unexpected = new RendererPort();
  run.port.send(packet(owned), [unexpected]);
  window.dispatchEvent(new Event('pagehide'));
  await run.pending;
  expect(unexpected.close).toHaveBeenCalledTimes(1);
  expect(NativeGenerator.created).toHaveLength(0);
  expect(NativeFrame.created[0]!.close).toHaveBeenCalledTimes(1);
});

it('rejects replay and aborts its first active native probe without returning an anchor', async () => {
  const run = await renderer();
  const first = frame();
  run.port.send(packet(first));
  const duplicate = frame();
  run.port.send(packet(duplicate));
  await run.pending;
  await Promise.resolve();
  expect(run.port.postMessage).toHaveBeenCalledTimes(1);
  expect(run.close).toHaveBeenCalledTimes(1);
  await assertDisposed();
});

it.each(['expired', 'wrong purpose'] as const)(
  'does not open ports or media for an %s renderer lease',
  async (cause) => {
    await runRecordingFrameClockRenderer(
      leaseHash(cause === 'expired' ? { expiresAtEpochMs: 999 } : { purpose: 'other' })
    );
    expect(rendezvous.open).not.toHaveBeenCalled();
    expect(NativeGenerator.created).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('cleans a disconnected helper waiting for its frame without creating native media', async () => {
  const run = await renderer();
  window.dispatchEvent(new Event('pagehide'));
  await run.pending;
  expect(run.close).toHaveBeenCalledTimes(1);
  expect(NativeGenerator.created).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps observer rendezvous failure advisory without creating a primary media path', async () => {
  rendezvous.open.mockRejectedValue(new Error('Clock unavailable'));
  await expect(runRecordingFrameClockRenderer(leaseHash())).resolves.toBeUndefined();
  expect(NativeFrame.created).toHaveLength(0);
  expect(NativeGenerator.created).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases native frame clones and generator ownership when stream construction fails', async () => {
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor() {
        throw new Error('Track rejected');
      }
    }
  );
  await expect(
    recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal)
  ).rejects.toThrow();
  for (const handle of NativeFrame.created) expect(handle.close).toHaveBeenCalledTimes(1);
  for (const generator of NativeGenerator.created) {
    expect(generator.stop).toHaveBeenCalledTimes(1);
    expect(generator.writer.abort).toHaveBeenCalledTimes(1);
    expect(generator.writer.releaseLock).toHaveBeenCalledTimes(1);
  }
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('accepts a rebased video presentation timestamp only for the exact native source pixels', async () => {
  const source = frame();
  const pending = recoverRecordingFrameCaptureEpoch(source, new AbortController().signal);
  NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 300000 };
  emit({ ...metadata(), mediaTime: 0.3 });
  await expect(pending).resolves.toBe(10500);
  await assertDisposed();
});

it('refuses rebased video timestamps when native source and renderer pixels differ', async () => {
  const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
  const refusal = expect(pending).rejects.toThrow();
  NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 300000 };
  NativeFrame.videoPixelValue = 18;
  emit({ ...metadata(), mediaTime: 0.3 });
  await refusal;
  await assertDisposed();
});

it.each(['copy failure', 'digest unavailable'] as const)(
  'keeps rebased native identity unavailable on %s',
  async (cause) => {
    if (cause === 'copy failure') NativeFrame.rejectCopy = true;
    else vi.stubGlobal('crypto', {});
    const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
    const refusal = expect(pending).rejects.toThrow();
    NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 300000 };
    emit({ ...metadata(), mediaTime: 0.3 });
    await refusal;
    await assertDisposed();
  }
);

it.each([64 * 1024 * 1024 + 1, -1, NaN])(
  'refuses unsafe native RGBA allocation %s before any pixel copy',
  async (allocation) => {
    NativeFrame.allocationOverride = allocation;
    const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
    const refusal = expect(pending).rejects.toThrow();
    NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 300000 };
    emit({ ...metadata(), mediaTime: 0.3 });
    await refusal;
    expect(NativeFrame.created.every((handle) => handle.copyTo.mock.calls.length === 0)).toBe(true);
    await assertDisposed();
  }
);

it('refuses unsafe dimension products even when native allocation reports a bounded size', async () => {
  NativeFrame.videoSample = {
    timestamp: 100000,
    displayWidth: Number.MAX_SAFE_INTEGER,
    displayHeight: 90,
  };
  NativeFrame.allocationOverride = 64 * 1024 * 1024;
  const pending = recoverRecordingFrameCaptureEpoch(frame(), new AbortController().signal);
  const refusal = expect(pending).rejects.toThrow();
  NativeFrame.videoSample = { ...NativeFrame.videoSample, timestamp: 300000 };
  emit({ ...metadata(), width: Number.MAX_SAFE_INTEGER, mediaTime: 0.3 });
  await refusal;
  expect(NativeFrame.created.every((handle) => handle.copyTo.mock.calls.length === 0)).toBe(true);
  await assertDisposed();
});
