// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { getRecordingMock, runtimeInfoGetUrlMock, sendRuntimeMessageMock, subscribeToMessagesMock } =
  vi.hoisted(() => ({
    getRecordingMock: vi.fn(),
    runtimeInfoGetUrlMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
    subscribeToMessagesMock: vi.fn(),
  }));

vi.mock('../../composition/persistence/recordings/index', () => ({
  cleanupOldRecordings: vi.fn(),
  deleteRecording: vi.fn(),
  getRecording: getRecordingMock,
  listRecordings: vi.fn(),
  saveRecording: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: subscribeToMessagesMock },
  runtimeInfo: { getURL: runtimeInfoGetUrlMock },
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

function createRecordingState(status = VideoRecordingStatus.RECORDING) {
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
    viewportPreset: null,
  };
}

function setRoute() {
  window.history.replaceState(
    {},
    '',
    '/apps/extension/src/camera-recorder/index.html?recordingId=rec-1&launchToken=launch-1'
  );
}

async function renderApp() {
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

function createMessaging(): RuntimeMessagingTransport {
  return {
    sendRuntimeMessage: sendRuntimeMessageMock,
    sendTabMessage: vi.fn(),
  };
}

function createSavedRecording(id: string) {
  return {
    blob: new Blob([id], { type: 'video/webm' }),
    createdAt: 1,
    filename: `${id}.webm`,
    id,
    size: 12,
  };
}

function createOffscreenSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html' };
}

function installRecordingMessageListener() {
  let listener: ((message: unknown, sender?: chrome.runtime.MessageSender) => void) | null = null;
  subscribeToMessagesMock.mockImplementation((nextListener) => {
    listener = nextListener;
    return () => undefined;
  });
  return {
    emitSaved: async (recordingId: string, sender = createOffscreenSender()) => {
      await act(async () => {
        listener?.({ type: VideoMessageType.VIDEO_SAVED_TO_IDB, recordingId }, sender);
        await Promise.resolve();
      });
    },
  };
}

function mockRegisteredRecordingState() {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
    })
    .mockResolvedValueOnce({
      success: true,
      state: createRecordingState(),
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  getRecordingMock.mockResolvedValue(createSavedRecording('rec-1'));
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
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('surfaces camera recorder registration failures', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Recording control lease is unavailable',
  });

  await renderApp();

  expect(container?.textContent).toContain('Recording control lease is unavailable');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    cameraLaunchToken: 'launch-1',
    recordingId: 'rec-1',
  });
});

it('surfaces rejected camera recorder control responses', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
    })
    .mockResolvedValueOnce({
      success: true,
      state: createRecordingState(),
    })
    .mockResolvedValueOnce({
      success: false,
      error: 'Pause rejected',
    });

  await renderApp();

  const pauseButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('popup.video.pauseButton')
  );
  expect(pauseButton).toBeDefined();

  await act(async () => {
    pauseButton?.click();
  });

  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: VideoMessageType.PAUSE_RECORDING,
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
  });
  expect(container?.textContent).toContain('Pause rejected');
});

it('starts a local camera preview for the selected camera in the main area', async () => {
  mockRegisteredRecordingState();

  await renderApp();

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: false,
    video: { deviceId: { exact: 'camera-1' } },
  });
  expect(container?.querySelector('video')).not.toBeNull();
});

it('keeps camera recording details compactly below the video preview', async () => {
  mockRegisteredRecordingState();

  await renderApp();

  const video = container?.querySelector('video');
  const title = Array.from(container?.querySelectorAll('div') ?? []).find(
    (element) => element.textContent === 'popup.video.cameraWindowTitle'
  );
  expect(video).not.toBeNull();
  expect(title).not.toBeUndefined();
  expect(video?.compareDocumentPosition(title ?? document.body)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(container?.textContent).toContain('00:07');
});

it('opens post-record actions from a trusted saved-recording event', async () => {
  const harness = installRecordingMessageListener();
  mockRegisteredRecordingState();

  await renderApp();
  await harness.emitSaved('rec-1');

  expect(container?.textContent).toContain('popup.video.postRecordTitle');
});

it('ignores unrelated, untrusted, or unavailable saved-recording events', async () => {
  const harness = installRecordingMessageListener();
  mockRegisteredRecordingState();

  await renderApp();
  await harness.emitSaved('rec-2');
  await harness.emitSaved('rec-1', { url: 'https://example.test/content.js' });
  getRecordingMock.mockResolvedValueOnce(undefined);
  await harness.emitSaved('rec-1');

  expect(container?.textContent).not.toContain('popup.video.postRecordTitle');
});
