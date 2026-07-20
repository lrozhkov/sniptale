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
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { usePauseResumeHandler } from './pause';
import {
  installPopupRuntimeMessagingMock,
  resetPopupRuntimeMessagingMock,
} from '../services.test-support';

let container: HTMLDivElement | null = null;
let latestPauseHandler: ReturnType<typeof usePauseResumeHandler> | null = null;
let root: Root | null = null;
const setRecordingErrorMock = vi.fn();
const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

beforeEach(() => {
  installPopupRuntimeMessagingMock(sendRuntimeMessageMock);
});

function PauseHarness(props: {
  capability?: typeof controlCapability | null;
  status: VideoRecordingStatus;
}) {
  latestPauseHandler = usePauseResumeHandler(
    props.capability === undefined ? controlCapability : props.capability,
    props.status,
    setRecordingErrorMock
  );
  return null;
}

async function renderHarness(
  status: VideoRecordingStatus = VideoRecordingStatus.RECORDING,
  capability: typeof controlCapability | null = controlCapability
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PauseHarness capability={capability} status={status} />);
  });
}

function getPauseHandler() {
  if (!latestPauseHandler) {
    throw new Error('Pause handler is not ready');
  }

  return latestPauseHandler;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestPauseHandler = null;
  container?.remove();
  container = null;
  resetPopupRuntimeMessagingMock();
  vi.clearAllMocks();
});

it('surfaces unsuccessful pause responses inline and clears stale errors on retry', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({ success: false, error: 'pause blocked' })
    .mockResolvedValueOnce({ success: true, result: 'accepted' });
  await renderHarness();

  await act(async () => {
    await getPauseHandler()();
  });
  await act(async () => {
    await getPauseHandler()();
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.PAUSE_RECORDING,
    ...controlCapability,
  });
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(1, null);
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(2, 'pause blocked');
  expect(setRecordingErrorMock).toHaveBeenNthCalledWith(3, null);
});

it('surfaces thrown pause failures inline and keeps logger diagnostics', async () => {
  const error = new Error('transport failed');
  sendRuntimeMessageMock.mockRejectedValueOnce(error);
  await renderHarness(VideoRecordingStatus.PAUSED);

  await act(async () => {
    await getPauseHandler()();
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.RESUME_RECORDING,
    ...controlCapability,
  });
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to change pause state', error);
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith('transport failed');
});

it('does not send pause or resume controls without a recording capability', async () => {
  await renderHarness(VideoRecordingStatus.RECORDING, null);

  await act(async () => {
    await getPauseHandler()();
  });

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith(expect.any(String));
});
