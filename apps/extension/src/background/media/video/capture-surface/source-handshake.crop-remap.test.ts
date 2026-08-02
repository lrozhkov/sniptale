import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createTransitionId: vi.fn(),
  getSession: vi.fn(),
  readViewport: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  setViewportOutputFrozen: vi.fn(),
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: mocks.createTransitionId,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('../capture-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../capture-viewport')>()),
  readTabCaptureViewport: mocks.readViewport,
}));
vi.mock('./output-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./output-state')>()),
  setViewportOutputFrozen: mocks.setViewportOutputFrozen,
}));
vi.mock('./session-registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-registry')>()),
  getVideoSurfaceSession: mocks.getSession,
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  acceptVideoSourceReady,
  cancelVideoSourceReadyWait,
  waitForVideoSourceReady,
} from './source-handshake';

const selectedViewport = {
  devicePixelRatio: 2,
  height: 720,
  scrollX: 0,
  scrollY: 0,
  visualViewportScale: 1,
  width: 1280,
};
const settledViewport = { ...selectedViewport, height: 985, width: 1904 };
const session = {
  applied: null,
  generation: 1,
  recordingId: 'recording-window-crop',
  sourceReady: false,
  sourceVideoHeight: null as number | null,
  sourceVideoWidth: null as number | null,
  streamInstanceId: null as string | null,
  tabId: 7,
};

function readyMessage(): Parameters<typeof acceptVideoSourceReady>[0] {
  return {
    generation: 1,
    recordingId: 'recording-window-crop',
    streamInstanceId: 'stream-instance-1',
    trackSettings: { height: 1440, width: 2560 },
    type: VideoMessageType.OFFSCREEN_SOURCE_READY,
    videoHeight: 1440,
    videoWidth: 2560,
  };
}

function waitForCropSourceReady(): Promise<string> {
  return waitForVideoSourceReady({
    expectedStreamInstanceId: 'stream-instance-1',
    expectedViewport: selectedViewport,
    recordingId: 'recording-window-crop',
    tabId: 7,
    viewportMismatchPolicy: 'remap',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.sourceReady = false;
  session.sourceVideoHeight = null;
  session.sourceVideoWidth = null;
  session.streamInstanceId = null;
  mocks.createTransitionId.mockReturnValue('starting-crop-1');
  mocks.getSession.mockReturnValue(session);
  mocks.readViewport.mockResolvedValue(settledViewport);
  mocks.sendRuntimeMessage.mockResolvedValue({
    result: 'ALLOW',
    success: true,
    videoHeight: 720,
    videoWidth: 1280,
  });
  mocks.setViewportOutputFrozen.mockResolvedValue('applied');
});

it('atomically remaps a crop source when a window preset settles after selection', async () => {
  const ready = waitForCropSourceReady();

  await expect(acceptVideoSourceReady(readyMessage())).resolves.toBe('ALLOW');
  await expect(ready).resolves.toBe('stream-instance-1');

  expect(mocks.setViewportOutputFrozen).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ recordingId: 'recording-window-crop' }),
    true,
    'starting-crop-1'
  );
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingId: 'recording-window-crop',
      transitionId: 'starting-crop-1',
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      viewport: settledViewport,
    })
  );
  expect(mocks.setViewportOutputFrozen).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ recordingId: 'recording-window-crop' }),
    false,
    'starting-crop-1'
  );
  expect(mocks.setViewportOutputFrozen.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.sendRuntimeMessage.mock.invocationCallOrder[0]!
  );
  expect(mocks.sendRuntimeMessage.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.setViewportOutputFrozen.mock.invocationCallOrder[1]!
  );
  expect(session).toMatchObject({
    sourceReady: true,
    sourceVideoHeight: 720,
    sourceVideoWidth: 1280,
  });
});

it('denies a failed crop remap when the exact transition cannot resume', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({
    error: 'crop mapping denied',
    result: 'DENY',
    success: false,
  });
  mocks.setViewportOutputFrozen
    .mockResolvedValueOnce('applied')
    .mockRejectedValueOnce(
      new Error('Viewport output cannot resume before frozen source geometry is applied')
    );
  const ready = waitForCropSourceReady();
  const readyFailure = expect(ready).rejects.toThrow(
    'Starting crop remap failed and its output could not resume'
  );

  await expect(acceptVideoSourceReady(readyMessage())).resolves.toBe('DENY');
  await readyFailure;

  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([
    true,
    false,
  ]);
  expect(session.sourceReady).toBe(false);
});

it('denies a successful crop remap when its exact transition cannot resume', async () => {
  mocks.setViewportOutputFrozen
    .mockResolvedValueOnce('applied')
    .mockRejectedValueOnce(new Error('crop output resume failed'));
  const ready = waitForCropSourceReady();
  const readyFailure = expect(ready).rejects.toThrow('crop output resume failed');

  await expect(acceptVideoSourceReady(readyMessage())).resolves.toBe('DENY');
  await readyFailure;

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
  expect(mocks.setViewportOutputFrozen.mock.calls.map(([, frozen]) => frozen)).toEqual([
    true,
    false,
  ]);
  expect(session).toMatchObject({
    sourceReady: false,
    sourceVideoHeight: null,
    sourceVideoWidth: null,
  });
});

it('does not mutate output after admission is cancelled during viewport measurement', async () => {
  let resolveViewport!: (viewport: typeof settledViewport) => void;
  mocks.readViewport.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveViewport = resolve;
    })
  );
  const ready = waitForCropSourceReady();
  const readyFailure = expect(ready).rejects.toThrow('recording start cancelled');
  const admission = acceptVideoSourceReady(readyMessage());
  await vi.waitFor(() => expect(mocks.readViewport).toHaveBeenCalledOnce());

  cancelVideoSourceReadyWait('recording-window-crop', new Error('recording start cancelled'));
  resolveViewport(settledViewport);

  await expect(admission).resolves.toBe('DENY');
  await readyFailure;
  expect(mocks.setViewportOutputFrozen).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
  expect(session.sourceReady).toBe(false);
});
