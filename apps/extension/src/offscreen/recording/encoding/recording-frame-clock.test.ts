import { afterEach, expect, it, vi } from 'vitest';
import { RecordingFrameClockObserver, sampleRecordingSourceClock } from './recording-frame-clock';
function createTestVideoFrame(timestamp: number): VideoFrame {
  return { timestamp, close: vi.fn() } as unknown as VideoFrame;
}

const binding = { recordingId: 'recording', generation: 1, streamInstanceId: 'source' };
afterEach(() => vi.unstubAllGlobals());
it('maps source timestamps with declared uncertainty and actual chosen resume PTS', () => {
  const observer = new RecordingFrameClockObserver(
    binding,
    { offsetMs: 100000, uncertaintyMs: 42 },
    8
  );
  observer.observeFirstFrame(createTestVideoFrame(1000000));
  expect(observer.anchor).toMatchObject({
    captureEpochMs: 101000,
    uncertaintyMs: 42,
    maximumUncertaintyMs: 8,
    mediaTimeSeconds: 0,
  });
  observer.pause(101400);
  expect(observer.resume(3000000, 0.5)).toMatchObject({
    captureEpochMs: 103000,
    mediaTimeSeconds: 0.5,
    previousMediaTimeSeconds: 0.4,
  });
  observer.dispose();
  expect(observer.resume(4000000, 0.6)).toBeNull();
});
it('keeps unavailable calibration separate from native primary frames', () => {
  const observer = new RecordingFrameClockObserver(binding, null);
  const frame = createTestVideoFrame(1000000);
  observer.observeFirstFrame(frame);
  expect(observer.anchor).toBeNull();
  expect(frame.close).not.toHaveBeenCalled();
});
it('bounds the original frame by fresh acquisition and receipt, including reader delay', async () => {
  const frame = createTestVideoFrame(1000000);
  const cancel = vi.fn();
  const releaseLock = vi.fn();
  vi.stubGlobal(
    'MediaStreamTrackProcessor',
    class {
      readable = {
        getReader: () => ({
          read: async () => ({ value: frame }),
          cancel: async () => cancel(),
          releaseLock,
        }),
      };
    }
  );
  const stop = vi.fn();
  const track = { kind: 'video', stop } as unknown as MediaStreamVideoTrack;
  const measured = await sampleRecordingSourceClock(track, 100950, () => 101150);
  expect(measured).toEqual({ offsetMs: 100050, uncertaintyMs: expect.closeTo(100.2, 6) });
  expect(Math.abs(100000 - measured!.offsetMs)).toBeLessThanOrEqual(measured!.uncertaintyMs);
  expect(frame.close).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
  expect(releaseLock).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();
});
it('times out and closes a late delivered frame without stopping its borrowed track', async () => {
  vi.useFakeTimers();
  try {
    let deliver!: (value: { value: VideoFrame }) => void;
    const frame = createTestVideoFrame(1000000);
    const cancel = vi.fn(async () => deliver({ value: frame }));
    const releaseLock = vi.fn();
    const stop = vi.fn();
    vi.stubGlobal(
      'MediaStreamTrackProcessor',
      class {
        readable = {
          getReader: () => ({
            read: () =>
              new Promise((resolve) => {
                deliver = resolve;
              }),
            cancel,
            releaseLock,
          }),
        };
      }
    );
    const pending = sampleRecordingSourceClock(
      { kind: 'video', stop } as unknown as MediaStreamVideoTrack,
      100000,
      () => 101000,
      250
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toBeNull();
    expect(frame.close).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
