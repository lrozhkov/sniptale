// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { beginRecordingSession } from './capture';
import type { RecordingSessionArgs } from './session-types';

class Recorder extends EventTarget {
  static latest: Recorder;
  state = 'inactive';
  mimeType = 'audio/webm';
  constructor() {
    super();
    Recorder.latest = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const data = new Event('dataavailable');
    Object.defineProperty(data, 'data', { value: new Blob(['voice']) });
    this.dispatchEvent(data);
    this.dispatchEvent(new Event('stop'));
  }
}
function fixture() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const acquire = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: acquire } });
  const args: RecordingSessionArgs = {
    deviceId: 'microphone',
    mimeType: 'audio/webm',
    errors: {
      noSupport: 'unsupported',
      permissionDenied: 'denied',
      startFailed: 'failed',
      playFailed: 'play',
    },
    refs: {
      chunksRef: { current: [] },
      mediaRecorderRef: { current: null },
      sessionRef: { current: 1 },
      streamRef: { current: null },
      timerRef: { current: null },
    },
    state: {
      audioBlob: null,
      audioRef: { current: null },
      audioUrl: null,
      durationSeconds: 0,
      error: null,
      isPlayingSelection: false,
      recordedDuration: 0,
      status: 'idle',
      trimEnd: 0,
      trimStart: 0,
      setAudioBlob: vi.fn(),
      setAudioUrl: vi.fn(),
      setDurationSeconds: vi.fn(),
      setError: vi.fn(),
      setIsPlayingSelection: vi.fn(),
      setRecordedDuration: vi.fn(),
      setStatus: vi.fn(),
      setTrimEnd: vi.fn(),
      setTrimStart: vi.fn(),
    },
    clearTimer: vi.fn(() => window.clearInterval(args.refs.timerRef.current!)),
    stopStream: vi.fn(stop),
    resetSession: vi.fn(() => {
      args.refs.sessionRef.current++;
      args.clearTimer();
      args.stopStream();
    }),
  };
  return { args, acquire, stream, stop };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:recorded') });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('records the selected device and publishes one bounded blob when recording stops', async () => {
  const { args, acquire, stop } = fixture();
  args.timeline = {
    startTime: 2,
    duration: 0.3,
    beforeStart: vi.fn(async () => {}),
    onStop: vi.fn(),
  };
  await beginRecordingSession(args);
  expect(acquire).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'microphone' } } });
  expect(args.state.setStatus).toHaveBeenCalledWith('recording');
  vi.advanceTimersByTime(450);
  expect(Recorder.latest.state).toBe('inactive');
  expect(stop).toHaveBeenCalledOnce();
  expect(args.timeline.onStop).toHaveBeenCalledOnce();
  expect(args.state.setAudioBlob).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'audio/webm', size: 5 })
  );
  expect(args.state.setTrimEnd).toHaveBeenLastCalledWith(0.3);
  expect(vi.getTimerCount()).toBe(0);
});
it('discards a microphone permission result after the capture session is cancelled', async () => {
  const { args, acquire, stream, stop } = fixture();
  let resolve!: (stream: MediaStream) => void;
  acquire.mockReturnValue(
    new Promise<MediaStream>((done) => {
      resolve = done;
    })
  );
  const pending = beginRecordingSession(args);
  args.refs.sessionRef.current++;
  resolve(stream);
  await pending;
  expect(stop).toHaveBeenCalledOnce();
  expect(args.state.setStatus).not.toHaveBeenCalled();
  expect(args.refs.mediaRecorderRef.current).toBeNull();
});
it('discards a cancelled timeline start and stale recorder stop events', async () => {
  const { args, stop } = fixture();
  let ready!: () => void;
  args.timeline = {
    startTime: 0,
    duration: 1,
    beforeStart: () =>
      new Promise<void>((done) => {
        ready = done;
      }),
    onStop: vi.fn(),
  };
  const pending = beginRecordingSession(args);
  await Promise.resolve();
  args.refs.sessionRef.current++;
  ready();
  await pending;
  expect(stop).toHaveBeenCalledOnce();
  args.timeline = undefined;
  await beginRecordingSession(args);
  args.resetSession();
  Recorder.latest.stop();
  expect(args.state.setAudioBlob).not.toHaveBeenCalled();
});
it.each(['permission', 'start'])('keeps the localized %s error after cleanup', async (failure) => {
  const { args, acquire } = fixture();
  if (failure === 'permission') acquire.mockRejectedValue(new Error('denied'));
  else
    args.timeline = {
      startTime: 0,
      duration: 1,
      beforeStart: async () => {
        throw new Error('start');
      },
      onStop: vi.fn(),
    };
  await beginRecordingSession(args);
  expect(args.resetSession).toHaveBeenCalledOnce();
  expect(args.state.setError).toHaveBeenLastCalledWith(
    failure === 'permission' ? 'denied' : 'failed'
  );
  expect(args.state.setAudioBlob).not.toHaveBeenCalled();
});
