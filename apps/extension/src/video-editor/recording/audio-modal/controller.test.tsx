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
  latestController = useAudioRecordingController(true, vi.fn());
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
