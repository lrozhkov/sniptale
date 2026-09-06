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
