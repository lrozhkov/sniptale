// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAudioRecordingSession } from './session';
import type { AudioRecordingControllerState, AudioRecordingTimeline } from './session-types';

const levelObserver = vi.hoisted(() => ({
  observe: vi.fn(),
  dispose: vi.fn(),
  frame: null as null | ((frame: { level: number; peaks: number[] }) => void),
}));
vi.mock('@sniptale/platform/browser/user-media', () => ({
  observeMicrophoneLevel: levelObserver.observe,
}));

const errors = {
  noSupport: 'unsupported',
  permissionDenied: 'denied',
  startFailed: 'failed',
  playFailed: 'play failed',
};
let latest: AudioRecordingControllerState;
let root: Root;
let host: HTMLDivElement;
let stopped: ReturnType<typeof vi.fn>;
let acquire: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;
class Recorder extends EventTarget {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    const event = new Event('dataavailable');
    Object.defineProperty(event, 'data', { value: new Blob(['voice']) });
    this.dispatchEvent(event);
    this.dispatchEvent(new Event('stop'));
  }
}
function Subject({ open = true, timeline }: { open?: boolean; timeline?: AudioRecordingTimeline }) {
  latest = useAudioRecordingSession(open, errors, '', timeline);
  return latest.trim ? <audio ref={latest.trim.audioRef} src={latest.trim.audioUrl} /> : null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('MediaRecorder', Recorder);
  stopped = vi.fn();
  const track = Object.assign(new EventTarget(), {
    stop: stopped,
    enabled: true,
    muted: false,
    readyState: 'live',
  });
  acquire = vi.fn().mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [track] });
  levelObserver.dispose.mockClear();
  levelObserver.observe.mockReset().mockImplementation((_track, listener) => {
    levelObserver.frame = listener;
    return { dispose: levelObserver.dispose };
  });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: acquire } });
  revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:voice', revokeObjectURL: revoke });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Subject />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('reports unavailable recording and localized permission failure without publishing audio', async () => {
  vi.stubGlobal('MediaRecorder', undefined);
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.error).toBe('unsupported');
  expect(acquire).not.toHaveBeenCalled();
  vi.stubGlobal('MediaRecorder', Recorder);
  acquire.mockRejectedValue(new Error('permission'));
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.error).toBe('denied');
  expect(latest.transport.status).toBe('idle');
  expect(latest.trim).toBeNull();
});
it('releases a late permission stream after the owning view closes', async () => {
  let finish!: (stream: unknown) => void;
  acquire.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = latest.transport.startRecording();
  });
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => {
    finish({ getTracks: () => [{ stop: stopped }] });
    await pending;
  });
  expect(stopped).toHaveBeenCalledOnce();
  expect(host.querySelector('audio')).toBeNull();
});
it('retains captured audio for trim and retry then releases its URL on unmount', async () => {
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.status).toBe('recording');
  await act(async () => latest.transport.stopRecording());
  expect(latest.transport.status).toBe('recorded');
  expect(stopped).toHaveBeenCalledOnce();
  await act(async () => {
    latest.trim!.resolveDuration(4);
    latest.trim!.selectRange({ start: 1, end: 3 });
  });
  const audio = host.querySelector('audio')!;
  const play = vi
    .spyOn(audio, 'play')
    .mockRejectedValueOnce(new Error('blocked'))
    .mockResolvedValue(undefined);
  await act(async () => latest.trim!.playSelection());
  expect(latest.transport.error).toBe('play failed');
  expect(latest.save.audioBlob?.size).toBe(5);
  expect(latest.save.trimStart).toBe(1);
  expect(latest.save.trimEnd).toBe(3);
  expect(audio.currentTime).toBe(1);
  await act(async () => latest.trim!.playSelection());
  expect(play).toHaveBeenCalledTimes(2);
  expect(latest.transport.error).toBeNull();
  await act(async () => root.unmount());
  root = createRoot(host);
  expect(revoke).toHaveBeenCalledWith('blob:voice');
});

it('monitors the captured track, clears the level on pause, and disposes on stop', async () => {
  await act(async () => latest.transport.startRecording());
  expect(acquire).toHaveBeenCalledOnce();
  const activeTrack = (
    await acquire.mock.results[0]!.value
  ).getAudioTracks()[0] as MediaStreamTrack;
  expect(levelObserver.observe).toHaveBeenCalledWith(
    activeTrack,
    expect.any(Function),
    expect.any(Function)
  );
  await act(async () => levelObserver.frame?.({ level: 0.4, peaks: [0.4] }));
  expect(latest.meter.status).toBe('voice');
  await act(async () => levelObserver.frame?.({ level: 0, peaks: [0] }));
  expect(latest.meter.status).toBe('silence');
  Object.defineProperty(activeTrack, 'muted', { value: true, configurable: true });
  await act(async () => activeTrack.dispatchEvent(new Event('mute')));
  expect(latest.meter.status).toBe('unavailable');
  await act(async () => levelObserver.frame?.({ level: 0.5, peaks: [0.5] }));
  expect(latest.meter.status).toBe('unavailable');
  Object.defineProperty(activeTrack, 'muted', { value: false, configurable: true });
  await act(async () => activeTrack.dispatchEvent(new Event('unmute')));
  expect(latest.meter.status).toBe('listening');
  await act(async () => latest.transport.pauseRecording());
  expect(latest.meter.status).toBe('paused');
  expect(latest.meter.level).toBe(0);
  expect(levelObserver.dispose).toHaveBeenCalledOnce();
  await act(async () => latest.transport.resumeRecording());
  expect(levelObserver.observe).toHaveBeenCalledTimes(2);
  await act(async () => levelObserver.frame?.({ level: 0.5, peaks: [0.5] }));
  expect(latest.meter.status).toBe('voice');
  await act(async () => latest.transport.stopRecording());
  expect(levelObserver.dispose).toHaveBeenCalledTimes(2);
  await act(async () => levelObserver.frame?.({ level: 0.5, peaks: [0.5] }));
  expect(latest.meter.status).toBe('idle');
});

it('keeps recording when level analysis is unavailable', async () => {
  levelObserver.observe.mockImplementation(() => {
    throw new Error('analyser unavailable');
  });
  await act(async () => latest.transport.startRecording());
  expect(latest.transport.status).toBe('recording');
  expect(latest.meter.status).toBe('unavailable');
  await act(async () => latest.transport.stopRecording());
  expect(latest.save.audioBlob?.size).toBe(5);
});

it('does not announce silence after audio analysis fails to start', async () => {
  await act(async () => latest.transport.startRecording());
  const unavailable = levelObserver.observe.mock.calls[0]?.[2] as () => void;
  await act(async () => unavailable());
  expect(latest.meter.status).toBe('unavailable');
  await act(async () => levelObserver.frame?.({ level: 0, peaks: [0] }));
  expect(latest.meter.status).toBe('unavailable');
  expect(latest.transport.status).toBe('recording');
});

it('recovers the live meter when a microphone starts muted and later unmutes', async () => {
  const track = Object.assign(new EventTarget(), {
    stop: stopped,
    enabled: true,
    muted: true,
    readyState: 'live',
  });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  acquire.mockResolvedValue(stream);
  acquire.mockClear();
  await act(async () => latest.transport.startRecording());
  expect(latest.meter.status).toBe('unavailable');
  Object.defineProperty(track, 'muted', { value: false, configurable: true });
  await act(async () => track.dispatchEvent(new Event('unmute')));
  await act(async () => levelObserver.frame?.({ level: 0.5, peaks: [0.5] }));
  expect(latest.meter.status).toBe('voice');
});

it('excludes paused wall time and can stop a paused recording', async () => {
  vi.useFakeTimers();
  try {
    await act(async () => latest.transport.startRecording());
    await act(async () => vi.advanceTimersByTime(1200));
    await act(async () => latest.transport.pauseRecording());
    expect(latest.transport.status).toBe('paused');
    const pausedAt = latest.transport.elapsedSeconds;
    await act(async () => vi.advanceTimersByTime(3000));
    expect(latest.transport.elapsedSeconds).toBe(pausedAt);
    await act(async () => latest.transport.resumeRecording());
    expect(latest.transport.status).toBe('recording');
    await act(async () => vi.advanceTimersByTime(800));
    expect(latest.transport.elapsedSeconds).toBeGreaterThan(pausedAt);
    expect(latest.transport.elapsedSeconds).toBeLessThan(2.2);
    await act(async () => latest.transport.pauseRecording());
    await act(async () => latest.transport.stopRecording());
    expect(latest.transport.status).toBe('recorded');
    expect(latest.save.trimEnd).toBeLessThan(2.2);
  } finally {
    vi.useRealTimers();
  }
});

it('does not restart playback after a paused take closes during asynchronous resume', async () => {
  let finishResume!: () => void;
  const onPause = vi.fn();
  const timeline: AudioRecordingTimeline = {
    startTime: 0,
    duration: 10,
    beforeStart: async () => undefined,
    onStop: vi.fn(),
    onPause,
    onResume: () =>
      new Promise<void>((resolve) => {
        finishResume = resolve;
      }),
  };
  await act(async () => root.render(<Subject timeline={timeline} />));
  await act(async () => latest.transport.startRecording());
  await act(async () => latest.transport.pauseRecording());
  let pending!: Promise<void>;
  await act(async () => {
    pending = latest.transport.resumeRecording();
  });
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => {
    finishResume();
    await pending;
  });
  expect(onPause).toHaveBeenCalledOnce();
  expect(stopped).toHaveBeenCalledOnce();
});

it('allows only one resume attempt while playback is still starting', async () => {
  let finishResume!: () => void;
  const onResume = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishResume = resolve;
      })
  );
  const onPause = vi.fn();
  const timeline: AudioRecordingTimeline = {
    startTime: 0,
    duration: 10,
    beforeStart: async () => undefined,
    onStop: vi.fn(),
    onPause,
    onResume,
  };
  await act(async () => root.render(<Subject timeline={timeline} />));
  await act(async () => latest.transport.startRecording());
  await act(async () => latest.transport.pauseRecording());
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = latest.transport.resumeRecording();
    second = latest.transport.resumeRecording();
  });
  expect(onResume).toHaveBeenCalledOnce();
  await act(async () => {
    finishResume();
    await Promise.all([first, second]);
  });
  expect(latest.transport.status).toBe('recording');
  expect(onPause).toHaveBeenCalledOnce();
});
