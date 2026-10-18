// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

function createRecordingState(status: VideoRecordingStatus = VideoRecordingStatus.RECORDING) {
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

function unmountApp() {
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function installRecordingMessageListener() {
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

function mockRegisteredRecordingState() {
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
      state: createRecordingState(),
    });
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

it('surfaces camera recorder registration failures', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: false,
    error: 'Recording control lease is unavailable',
  });

  await renderApp();

  expect(container?.textContent).toContain(
    'popup.video.loadingPopupError. common.errors.browserCommunicationDetail'
  );
  expect(
    Array.from(container?.querySelectorAll('button') ?? []).every((button) => button.disabled)
  ).toBe(true);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
    cameraRegistrationToken: 'launch-1',
    recordingId: 'rec-1',
  });
});

it('does not retain the recording identity or registration token in page storage', async () => {
  mockRegisteredRecordingState();

  await renderApp();

  expect(window.sessionStorage.length).toBe(0);
});

it('surfaces rejected camera recorder control responses', async () => {
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
  expect(container?.textContent).toContain(
    'common.errors.actionFailed. common.errors.browserCommunicationDetail'
  );
});

it('localizes an asynchronous camera frame-rate start failure', async () => {
  const harness = installRecordingMessageListener();
  mockRegisteredRecordingState();
  await renderApp();

  await harness.emitStartFailure('camera-frame-rate-unsupported');

  expect(container?.textContent).toContain('background.runtime.cameraFrameRateUnsupported');
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
  const title = Array.from(container?.querySelectorAll('h1') ?? []).find(
    (element) => element.textContent === 'popup.video.cameraWindowTitle'
  );
  expect(video).not.toBeNull();
  expect(title).not.toBeUndefined();
  expect(video?.compareDocumentPosition(title ?? document.body)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING
  );
  expect(container?.textContent).toContain('00:07');
});

it('restores post-record actions from the persisted result after the recording becomes idle', async () => {
  const harness = installRecordingMessageListener();
  mockRegisteredRecordingState();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    postRecordResult: {
      primaryRecordingId: 'rec-1',
      projectId: null,
      recordingId: 'rec-1',
    },
    state: createRecordingState(VideoRecordingStatus.IDLE),
    success: true,
  });

  await renderApp();
  await harness.emitState(VideoRecordingStatus.IDLE);

  expect(container?.textContent).toContain('popup.video.postRecordTitle');
});

it('reconnects the same camera tab without page identity and can GET then ACK the result', async () => {
  const result = {
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  };
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
      result: 'active',
      success: true,
    })
    .mockResolvedValueOnce({ success: true, state: createRecordingState() });

  await renderApp();
  expect(window.location.search).toBe('');
  expect(window.sessionStorage.length).toBe(0);
  unmountApp();

  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      recordingId: 'rec-1',
      result: 'post-record-only',
      success: true,
    })
    .mockResolvedValueOnce({
      postRecordResult: result,
      state: createRecordingState(VideoRecordingStatus.IDLE),
      success: true,
    })
    .mockResolvedValueOnce({ result: 'acknowledged', success: true });

  await renderApp();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.REGISTER_CAMERA_RECORDER_CONTROL,
  });
  expect(container?.textContent).toContain('popup.video.postRecordTitle');

  const closeButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('popup.video.postRecordClose')
  );
  vi.spyOn(window, 'close').mockImplementation(() => undefined);
  await act(async () => {
    closeButton?.click();
    await Promise.resolve();
  });
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    recordingId: 'rec-1',
    type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
  });
  expect(window.sessionStorage.length).toBe(0);
});

it('serializes post-record decisions and keeps durable authority visible when ACK fails', async () => {
  const result = {
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  };
  const acknowledgement = createDeferred<{ error: string; success: false }>();
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      recordingId: 'rec-1',
      result: 'post-record-only',
      success: true,
    })
    .mockResolvedValueOnce({
      postRecordResult: result,
      state: createRecordingState(VideoRecordingStatus.IDLE),
      success: true,
    })
    .mockReturnValueOnce(acknowledgement.promise);

  await renderApp();
  const closeButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('popup.video.postRecordClose')
  );

  await act(async () => {
    closeButton?.click();
    closeButton?.click();
    await Promise.resolve();
  });

  expect(
    sendRuntimeMessageMock.mock.calls.filter(
      ([message]) => message.type === VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT
    )
  ).toHaveLength(1);
  expect(
    Array.from(container?.querySelectorAll('button') ?? []).every((button) => button.disabled)
  ).toBe(true);

  acknowledgement.resolve({ error: 'Session write failed', success: false });
  await act(async () => {
    await acknowledgement.promise;
    await Promise.resolve();
  });

  expect(container?.textContent).toContain('popup.video.postRecordTitle');
  expect(container?.textContent).toContain('popup.video.postRecordActionError');
});

it('does not invent post-record actions when the persisted result is unavailable', async () => {
  const harness = installRecordingMessageListener();
  mockRegisteredRecordingState();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    state: createRecordingState(VideoRecordingStatus.IDLE),
    success: true,
  });

  await renderApp();
  await harness.emitState(VideoRecordingStatus.IDLE);

  expect(container?.textContent).not.toContain('popup.video.postRecordTitle');
});

it('does not restore an acknowledged result from an older in-flight refresh', async () => {
  const harness = installRecordingMessageListener();
  const result = {
    primaryRecordingId: 'rec-1',
    projectId: null,
    recordingId: 'rec-1',
  };
  const delayedRefresh = createDeferred<{
    postRecordResult: typeof result;
    state: ReturnType<typeof createRecordingState>;
    success: true;
  }>();
  const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: true,
      controlToken: 'control-token-1',
      recordingId: 'rec-1',
      result: 'active',
    })
    .mockResolvedValueOnce({
      postRecordResult: result,
      state: createRecordingState(VideoRecordingStatus.IDLE),
      success: true,
    })
    .mockReturnValueOnce(delayedRefresh.promise)
    .mockResolvedValueOnce({ result: 'acknowledged', success: true });

  await renderApp();
  expect(container?.textContent).toContain('popup.video.postRecordTitle');

  await harness.emitState(VideoRecordingStatus.IDLE);
  const closeButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('popup.video.postRecordClose')
  );
  await act(async () => {
    closeButton?.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  delayedRefresh.resolve({
    postRecordResult: result,
    state: createRecordingState(VideoRecordingStatus.IDLE),
    success: true,
  });
  await act(async () => {
    await delayedRefresh.promise;
    await Promise.resolve();
  });

  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: VideoMessageType.ACKNOWLEDGE_POST_RECORD_RESULT,
    recordingId: 'rec-1',
  });
  expect(container?.textContent).not.toContain('popup.video.postRecordTitle');
  closeSpy.mockRestore();
});

function getCommand(label: string): HTMLButtonElement {
  const button = Array.from(container?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) throw new Error(`Missing command: ${label}`);
  return button;
}

async function openCancelConfirmation() {
  const cancel = getCommand('popup.video.cancelButton');
  cancel.focus();
  await act(async () => cancel.click());
  const continueButton = getCommand('popup.video.cancelContinueRecording');
  expect(document.activeElement).toBe(continueButton);
  return continueButton;
}

it('returns focus and active controls after Continue with exactly one current resume command', async () => {
  mockRegisteredRecordingState();
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
    state: createRecordingState(),
  });
  await renderApp();
  const continueButton = await openCancelConfirmation();

  await act(async () => continueButton.click());

  expect(document.activeElement).toBe(getCommand('popup.video.cancelButton'));
  expect(getCommand('popup.video.stopButton').disabled).toBe(false);
  expect(getCommand('popup.video.pauseButton').disabled).toBe(false);
  expect(container?.textContent).not.toContain('popup.video.cancelContinueRecording');
  expect(
    sendRuntimeMessageMock.mock.calls.filter(
      ([message]) => message.type === VideoMessageType.RESUME_RECORDING
    )
  ).toEqual([
    [
      {
        type: VideoMessageType.RESUME_RECORDING,
        controlToken: 'control-token-1',
        recordingId: 'rec-1',
      },
    ],
  ]);
});

it('keeps active controls and focus reachable after refused Continue so the user can retry', async () => {
  mockRegisteredRecordingState();
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'Resume rejected' });
  await renderApp();
  const continueButton = await openCancelConfirmation();

  await act(async () => continueButton.click());

  expect(container?.textContent).toContain('common.errors.actionFailed');
  expect(document.activeElement).toBe(getCommand('popup.video.cancelButton'));
  expect(getCommand('popup.video.stopButton').disabled).toBe(false);
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(3);

  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
    state: createRecordingState(),
  });
  const retry = await openCancelConfirmation();
  await act(async () => retry.click());
  expect(container?.textContent).not.toContain('common.errors.actionFailed');
  expect(document.activeElement).toBe(getCommand('popup.video.cancelButton'));
});

it('keeps microphone property activation on the existing capability and accepted media state', async () => {
  mockRegisteredRecordingState();
  sendRuntimeMessageMock.mockResolvedValue({ success: false, error: 'Update rejected' });
  await renderApp();
  const microphone = container?.querySelector<HTMLButtonElement>('[aria-pressed]');
  expect(microphone?.getAttribute('aria-pressed')).toBe('true');
  expect(microphone?.getAttribute('aria-label')).toBe('popup.video.activeMicrophoneMute');

  await act(async () => microphone?.click());

  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    type: VideoMessageType.UPDATE_SETTINGS,
    controlToken: 'control-token-1',
    recordingId: 'rec-1',
    settings: { microphoneEnabled: false },
  });
  expect(microphone?.getAttribute('aria-pressed')).toBe('true');
  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    'common.errors.actionFailed'
  );
});

it.each(['refused', 'rejected', 'refresh-rejected'] as const)(
  'keeps inline Delete open and recoverable when %s',
  async (failure) => {
    mockRegisteredRecordingState();
    if (failure === 'refused') {
      sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'Discard rejected' });
    } else if (failure === 'rejected') {
      sendRuntimeMessageMock.mockRejectedValueOnce(new Error('Discard failed'));
    } else {
      sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'accepted' });
      sendRuntimeMessageMock.mockRejectedValueOnce(new Error('Refresh failed'));
    }
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    try {
      await renderApp();
      await openCancelConfirmation();
      await act(async () => getCommand('popup.video.cancelDeleteRecording').click());

      expect(close).not.toHaveBeenCalled();
      expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
        'common.errors.actionFailed'
      );
      expect(getCommand('popup.video.cancelContinueRecording').disabled).toBe(false);
    } finally {
      close.mockRestore();
    }
  }
);

it('closes accepted inline Delete once and only after its state refresh succeeds', async () => {
  mockRegisteredRecordingState();
  const refreshed = createDeferred<{
    success: true;
    controlToken: string;
    recordingId: string;
    state: ReturnType<typeof createRecordingState>;
  }>();
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: true, result: 'accepted' });
  sendRuntimeMessageMock.mockReturnValueOnce(refreshed.promise);
  const close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  try {
    await renderApp();
    await openCancelConfirmation();
    await act(async () => getCommand('popup.video.cancelDeleteRecording').click());

    expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(3, {
      type: VideoMessageType.STOP_RECORDING,
      controlToken: 'control-token-1',
      discard: true,
      recordingId: 'rec-1',
    });
    expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
      type: VideoMessageType.GET_RECORDING_STATE,
    });
    expect(close).not.toHaveBeenCalled();

    await act(async () => {
      refreshed.resolve({
        success: true,
        controlToken: 'control-token-1',
        recordingId: 'rec-1',
        state: createRecordingState(),
      });
    });

    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    close.mockRestore();
  }
});
