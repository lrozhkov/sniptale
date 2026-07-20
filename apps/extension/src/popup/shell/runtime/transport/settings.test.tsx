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

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { useUpdateRecordingSettingsHandler } from './settings';
import {
  installPopupRuntimeMessagingMock,
  resetPopupRuntimeMessagingMock,
} from '../services.test-support';

let container: HTMLDivElement | null = null;
let latestHandler: ReturnType<typeof useUpdateRecordingSettingsHandler> | null = null;
let root: Root | null = null;

const setRecordingErrorMock = vi.fn();
const controlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

function SettingsHarness({
  capability = controlCapability,
}: {
  capability?: typeof controlCapability | null;
}) {
  latestHandler = useUpdateRecordingSettingsHandler(capability, setRecordingErrorMock);
  return null;
}

async function renderHarness(capability: typeof controlCapability | null = controlCapability) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SettingsHarness capability={capability} />);
  });
}

function getSettingsHandler() {
  if (!latestHandler) {
    throw new Error('Settings handler is not ready');
  }

  return latestHandler;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installPopupRuntimeMessagingMock(sendRuntimeMessageMock);
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestHandler = null;
  container?.remove();
  container = null;
  resetPopupRuntimeMessagingMock();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('sends active recording settings through the authorized runtime route', async () => {
  await renderHarness();

  await act(async () => {
    await getSettingsHandler()({ microphoneEnabled: false });
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.UPDATE_SETTINGS,
    settings: { microphoneEnabled: false },
    ...controlCapability,
  });
  expect(setRecordingErrorMock).toHaveBeenCalledWith(null);
});

it('surfaces unsuccessful setting update responses inline', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'update blocked' });
  await renderHarness();

  await expect(getSettingsHandler()({ webcamEnabled: false })).rejects.toThrow('update blocked');

  expect(setRecordingErrorMock).toHaveBeenLastCalledWith('update blocked');
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to update recording settings',
    expect.any(Error)
  );
});

it('does not send live setting updates without a recording capability', async () => {
  await renderHarness(null);

  await expect(getSettingsHandler()({ microphoneEnabled: false })).rejects.toThrow();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(setRecordingErrorMock).toHaveBeenLastCalledWith(expect.any(String));
});
