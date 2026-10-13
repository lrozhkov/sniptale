import { describe, expect, it, vi } from 'vitest';
import { RecordingFrameClockObserver } from './recording-frame-clock';
import {
  RECORDING_FRAME_CLOCK_PURPOSE,
  type RecordingFrameClockLease,
} from '../../../contracts/video/recording-frame-clock';
import { LiveVideoTimeline } from './live-video-timeline';

const binding = { recordingId: 'recording', generation: 2, streamInstanceId: 'source' };
function lease(): RecordingFrameClockLease {
  return {
    ...binding,
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    expiresAtEpochMs: Date.now() + 10_000,
  };
}

function fixture(captureEpochMs = 1_000_000, wrongTimestamp = false, clockOffsetMs = 0) {
  const capability = lease();
  const clone = { timestamp: 60_000_000, close: vi.fn() };
  const original = { timestamp: clone.timestamp, clone: vi.fn(() => clone), close: vi.fn() };
  const port = {
    onmessage: null as null | ((event: { data: unknown; ports?: MessagePort[] }) => void),
    onmessageerror: null,
    postMessage: vi.fn(() => {
      queueMicrotask(() =>
        port.onmessage?.({
          ports: [],
          data: {
            type: 'result',
            nonce: capability.nonce,
            sourceTimestampUs: clone.timestamp + (wrongTimestamp ? 1 : 0),
            captureEpochMs,
            receivedAtMs: 1_000_010 + clockOffsetMs,
            repliedAtMs: 1_000_010 + clockOffsetMs,
          },
        })
      );
    }),
  };
  const close = vi.fn();
  const connect = vi.fn(async () => {
    queueMicrotask(() =>
      queueMicrotask(() =>
        port.onmessage?.({ ports: [], data: { type: 'ready', nonce: capability.nonce } })
      )
    );
    return { port: port as unknown as MessagePort, close };
  });
  const observer = new RecordingFrameClockObserver(binding, capability, connect, () => 1_000_010);
  return {
    observer,
    original: original as unknown as VideoFrame,
    originalHandle: original,
    clone,
    connect,
    close,
  };
}

describe('primary native recording frame clock observer', () => {
  it('bounds native capture translation from a displaced helper clock', async () => {
    const input = fixture(1_003_458.233, false, 3458.233);
    input.observer.observeFirstFrame(input.original);
    await input.observer.ready;
    expect(input.observer.anchor?.captureEpochMs).toBeCloseTo(1_000_000, 5);
    expect(input.observer.anchor?.uncertaintyMs).toBeGreaterThan(0);
    expect(input.observer.anchor?.uncertaintyMs).toBeLessThan(1);
    input.observer.dispose();
  });
  it('calibrates original capture epoch and reuses it with the encoder-selected resumed tick', async () => {
    const input = fixture();
    input.observer.observeFirstFrame(input.original);
    await input.observer.ready;
    expect(input.observer.anchor).toMatchObject({
      captureEpochMs: 1_000_000,
      mediaTimeSeconds: 0,
      revision: 1,
    });
    expect(input.originalHandle.close).not.toHaveBeenCalled();
    expect(input.originalHandle.clone).toHaveBeenCalledTimes(1);
    input.observer.pause(1_000_050);
    expect(input.observer.anchor).toMatchObject({
      mediaTimeSeconds: 0.05,
      phase: 'paused',
      revision: 2,
    });
    const timeline = new LiveVideoTimeline(30);
    timeline.accept(0);
    timeline.accept(1 / 30);
    timeline.finish();
    const chosenPTS = timeline.restart(1 / 30);
    const resumed = input.observer.resume(62_000_000, chosenPTS);
    expect(resumed).toMatchObject({
      captureEpochMs: 1_002_000,
      mediaTimeSeconds: 2 / 30,
      phase: 'active',
      revision: 3,
    });
    expect(input.connect).toHaveBeenCalledTimes(1);
    expect(input.close).toHaveBeenCalledTimes(1);
    input.observer.dispose();
  });

  it('does not open an optional port or clone pixels when a lease expires in transport', async () => {
    const capability = { ...lease(), expiresAtEpochMs: Date.now() - 1 };
    const connect = vi.fn();
    const frame = { timestamp: 1, clone: vi.fn(), close: vi.fn() };
    const observer = new RecordingFrameClockObserver(binding, capability, connect);
    observer.observeFirstFrame(frame as unknown as VideoFrame);
    await observer.ready;
    expect(observer.anchor).toBeNull();
    expect(connect).not.toHaveBeenCalled();
    expect(frame.clone).not.toHaveBeenCalled();
    expect(frame.close).not.toHaveBeenCalled();
  });

  it('refuses a mismatched exact-frame result without inventing a receipt calibration', async () => {
    const input = fixture(1_000_000, true);
    input.observer.observeFirstFrame(input.original);
    await input.observer.ready;
    expect(input.observer.anchor).toBeNull();
    expect(input.originalHandle.close).not.toHaveBeenCalled();
    expect(input.close).toHaveBeenCalledTimes(1);
  });
});
