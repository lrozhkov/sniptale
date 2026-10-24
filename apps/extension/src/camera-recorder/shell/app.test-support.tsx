import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

const { runtimeInfoGetUrlMock, sendRuntimeMessageMock, subscribeToMessagesMock } = vi.hoisted(
  () => ({
    runtimeInfoGetUrlMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
    subscribeToMessagesMock: vi.fn(),
  })
);

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: subscribeToMessagesMock },
  runtimeInfo: { getURL: runtimeInfoGetUrlMock },
}));

vi.mock('./camera-preview', () => ({
  CameraPreview: () => <video data-shared-camera-preview="true" />,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contracts/messaging/parsers/boundary')>()),
  parseRuntimeRequestMessage: (message: unknown) => message,
}));

import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { CameraRecorderApp } from './app';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function createRecordingState(
  status: VideoRecordingStatus = VideoRecordingStatus.RECORDING
) {
  return {
    captureMode: 'CAMERA',
    captureSource: { mode: 'CAMERA', streamId: 'camera' },
    countdownEndsAt: null,
    duration: 7,
    error: null,
    liveMedia: {
      microphoneDeviceId: 'microphone-1',
      microphoneEnabled: true,
      microphoneSelected: true,
      webcamDeviceId: 'camera-1',
      webcamEnabled: true,
      webcamSelected: true,
    },
    status,
    viewportPresetId: null,
  };
}

function setRoute() {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?recordingId=rec-1&launchToken=launch-1'
  );
}

export async function renderApp() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<CameraRecorderApp messaging={createMessaging()} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

export function unmountApp() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

function createMessaging(): RuntimeMessagingTransport {
  return {
    sendRuntimeMessage: sendRuntimeMessageMock,
    sendTabMessage: vi.fn(),
  };
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export function installRecordingMessageListener() {
  let listener: ((message: unknown, sender?: chrome.runtime.MessageSender) => void) | null = null;
  subscribeToMessagesMock.mockImplementation((nextListener) => {
    listener = nextListener;
    return () => undefined;
  });
  return {
    emitState: async (status: VideoRecordingStatus) => {
      await act(async () => {
        listener?.({
          type: VideoMessageType.RECORDING_STATE_SYNC,
          state: createRecordingState(status),
        });
        await Promise.resolve();
      });
    },
    emitStartFailure: async (error: string) => {
      await act(async () => {
        listener?.({ type: VideoMessageType.RECORDING_START_FAILED, error });
        await Promise.resolve();
      });
    },
  };
}

export function mockRegisteredRecordingState(
  patch: { displaySurface?: 'monitor' | 'window' | 'browser' | null | undefined } = {}
) {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
      result: 'active',
    })
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
      state: { ...createRecordingState(), ...patch },
    });
}

export { sendRuntimeMessageMock };

export function getContainer(): HTMLDivElement | null {
  return container;
}

export function installCameraRecorderTestHarness(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    runtimeInfoGetUrlMock.mockImplementation((path: string) => `chrome-extension://test/${path}`);
    subscribeToMessagesMock.mockReturnValue(() => undefined);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });
    setRoute();
  });

  afterEach(() => {
    unmountApp();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });
}
