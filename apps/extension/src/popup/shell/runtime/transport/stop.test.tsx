// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { loggerErrorMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { useStopHandler } from './stop';
import {
  installPopupRuntimeMessagingMock,
  resetPopupRuntimeMessagingMock,
} from '../services.test-support';

let container: HTMLDivElement | null = null;
let latestStopHandler: ReturnType<typeof useStopHandler> | null = null;
let root: Root | null = null;
const setRecordingErrorMock = vi.fn();
const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

beforeEach(() => {
  installPopupRuntimeMessagingMock(sendRuntimeMessageMock);
});

function StopHarness(props: { capability?: typeof controlCapability | null }) {
  latestStopHandler = useStopHandler(
    props.capability === undefined ? controlCapability : props.capability,
    setRecordingErrorMock
  );
  return null;
}

async function renderHarness(capability: typeof controlCapability | null = controlCapability) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<StopHarness capability={capability} />);
  });
}

function getStopHandler() {
  if (!latestStopHandler) {
    throw new Error('Stop handler is not ready');
  }

  return latestStopHandler;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestStopHandler = null;
  container?.remove();
  container = null;
  resetPopupRuntimeMessagingMock();
  vi.clearAllMocks();
});

it('sends stop messages with and without the optional discard flag and logs failures', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('stop failed'));
  await renderHarness();

  await act(async () => {
    await getStopHandler()();
  });
  await act(async () => {
    await getStopHandler()({ discard: true });
  });

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    type: VideoMessageType.STOP_RECORDING,
    ...controlCapability,
  });
  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    discard: true,
    type: VideoMessageType.STOP_RECORDING,
    ...controlCapability,
  });
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to stop recording', expect.any(Error));
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(1, null);
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(2, null);
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith('stop failed');
});

it('surfaces unsuccessful stop responses inline and clears stale errors on retry', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: false, error: 'No active recording' })
    .mockResolvedValueOnce({ success: true, result: 'accepted' });
  await renderHarness();

  await act(async () => {
    await getStopHandler()();
  });
  await act(async () => {
    await getStopHandler()();
  });

  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(1, null);
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(2, 'No active recording');
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(3, null);
});

it('does not send stop controls without a recording capability', async () => {
  await renderHarness(null);

  await act(async () => {
    await getStopHandler()();
  });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith(expect.any(String));
});

it('does not send start-cancellation without a recording control capability', async () => {
  await renderHarness(null);

  await act(async () => {
    await getStopHandler()({ cancelStart: true });
  });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith(expect.any(String));
});

it('sends start-cancellation with the recording control capability', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    result: 'cancelled-before-active',
  });
  await renderHarness();

  await act(async () => {
    await getStopHandler()({ cancelStart: true });
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.CANCEL_RECORDING_START,
    ...controlCapability,
  });
  expect(setRecordingErrorMock).toHaveBeenCalledWith(null);
});
