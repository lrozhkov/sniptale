// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioRecordingController, type AudioRecordingControllerState } from './controller';

const { getUserMediaMock } = vi.hoisted(() => ({
  getUserMediaMock: vi.fn().mockRejectedValue(new Error('denied')),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestController: AudioRecordingControllerState | null = null;

function ControllerHarness() {
  latestController = useAudioRecordingController(true);
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ControllerHarness />);
  });
}

beforeEach(() => {
  getUserMediaMock.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  class MockMediaRecorder {}
  Object.assign(MockMediaRecorder, {
    isTypeSupported: vi.fn().mockReturnValue(true),
  });
  vi.stubGlobal('MediaRecorder', MockMediaRecorder as unknown as typeof MediaRecorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock,
    },
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  latestController = null;
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('audio-recording-modal/controller', () => {
  it('keeps permission failures visible after a rejected recording start', async () => {
    await renderHarness();

    await act(async () => {
      await latestController?.transport.startRecording();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getUserMediaMock).toHaveBeenCalledOnce();
    expect(latestController?.transport.error).toBe('videoEditor.app.recordAudioPermissionDenied');
    expect(latestController?.transport.status).toBe('idle');
  });
});

it('keeps full recorded duration available after narrowing the selected interval', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  getUserMediaMock.mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] });
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['audio']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:recording-test';
      }
      static revokeObjectURL() {}
    }
  );
  await renderHarness();
  await act(async () => latestController?.transport.startRecording());
  now = 4000;
  act(() => latestController?.transport.stopRecording());
  expect(latestController?.trim?.recordedDuration).toBe(4);
  act(() => latestController?.trim?.selectRange({ start: 0, end: 1 }));
  expect(latestController?.save.trimEnd).toBe(1);
  expect(latestController?.trim?.recordedDuration).toBe(4);
  act(() => latestController?.trim?.selectRange({ start: 0, end: 4 }));
  expect(latestController?.save.trimEnd).toBe(4);
  const audio = document.createElement('audio');
  latestController!.trim!.audioRef.current = audio;
  const audioPlay = vi.spyOn(audio, 'play').mockRejectedValueOnce(new Error('blocked'));
  await act(async () => latestController?.trim?.playSelection());
  expect(latestController?.transport.error).toBe('videoEditor.app.sourcePlayFailed');
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  Object.defineProperty(audio, 'paused', { configurable: true, value: false });
  vi.spyOn(audio, 'pause').mockImplementation(() => undefined);
  audio.currentTime = 1.2;
  audioPlay.mockResolvedValueOnce(undefined);
  await act(async () => latestController?.trim?.playSelection());
  expect(audio.currentTime).toBe(1.2);
  expect(latestController?.trim?.isPlayingSelection).toBe(true);
  expect(latestController?.transport.error).toBeNull();
});

it('waits for video readiness, requests the chosen microphone and stops at the interval limit', async () => {
  vi.useFakeTimers();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const stopTrack = vi.fn();
  getUserMediaMock.mockResolvedValueOnce({ getTracks: () => [{ stop: stopTrack }] });
  const start = vi.fn();
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    start() {
      this.state = 'recording';
      start();
    }
    stop() {
      this.state = 'inactive';
      const data = new Event('dataavailable');
      Object.defineProperty(data, 'data', { value: new Blob(['audio']) });
      this.dispatchEvent(data);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:bounded';
      }
      static revokeObjectURL() {}
    }
  );
  let ready!: () => void;
  const beforeStart = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      })
  );
  const onStop = vi.fn();
  function Bounded() {
    latestController = useAudioRecordingController(true, false, 'chosen-mic', {
      startTime: 0,
      duration: 2,
      beforeStart,
      onStop,
    });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Bounded />));
  let pending: Promise<void> | undefined;
  await act(async () => {
    pending = latestController?.transport.startRecording();
    await Promise.resolve();
  });
  expect(getUserMediaMock).toHaveBeenCalledWith({ audio: { deviceId: { exact: 'chosen-mic' } } });
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    ready();
    await pending;
  });
  expect(start).toHaveBeenCalledOnce();
  now = 2100;
  act(() => vi.advanceTimersByTime(150));
  expect(latestController?.transport.status).toBe('recorded');
  expect(latestController?.save.trimEnd).toBe(2);
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(onStop).toHaveBeenCalledOnce();
  act(() => latestController?.trim?.resolveDuration(2.1));
  expect(latestController?.trim?.recordedDuration).toBe(2);
  vi.useRealTimers();
});

it('ignores late recorder events from a closed take after a new take starts', async () => {
  const oldTrackStop = vi.fn();
  const newTrackStop = vi.fn();
  getUserMediaMock
    .mockResolvedValueOnce({ getTracks: () => [{ stop: oldTrackStop }] })
    .mockResolvedValueOnce({ getTracks: () => [{ stop: newTrackStop }] });
  const recorders: Recorder[] = [];
  class Recorder extends EventTarget {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    constructor() {
      super();
      recorders.push(this);
    }
    start() {
      this.state = 'recording';
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  const onStop = vi.fn();
  function Bounded() {
    latestController = useAudioRecordingController(true, false, '', {
      startTime: 0,
      duration: 5,
      beforeStart: async () => undefined,
      onStop,
    });
    return null;
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<Bounded />));
  await act(async () => latestController?.transport.startRecording());
  act(() => latestController?.save.resetSession());
  await act(async () => latestController?.transport.startRecording());
  act(() => recorders[0]!.dispatchEvent(new Event('stop')));
  expect(newTrackStop).not.toHaveBeenCalled();
  expect(onStop).not.toHaveBeenCalled();
  expect(latestController?.transport.status).toBe('recording');
});
