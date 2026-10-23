import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const mocks = vi.hoisted(() => ({
  startSingleSource: vi.fn(),
  startMultiSource: vi.fn(),
  send: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./start/index', () => ({ startRecording: mocks.startSingleSource }));
vi.mock('./start/cleanup', () => ({ cleanupResources: vi.fn() }));
vi.mock('./multi-source', () => ({
  cancelPendingMultiSourceRecordingStart: vi.fn(),
  getActiveMultiSourceRecordingId: vi.fn(() => null),
  hasActiveMultiSourceRecording: vi.fn(() => false),
  pauseMultiSourceRecording: vi.fn(),
  resumeMultiSourceRecording: vi.fn(),
  startMultiSourceRecording: mocks.startMultiSource,
  stopMultiSourceRecording: vi.fn(),
  updateMultiSourceRecordingSettings: vi.fn(),
}));
vi.mock('./sidecar', () => ({
  hasActiveSidecarSession: vi.fn(() => false),
  pauseActiveSidecarRecorders: vi.fn(),
  resumeActiveSidecarRecorders: vi.fn(),
  setActiveSidecarWebcamEnabled: vi.fn(),
}));
vi.mock('../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging')>()),
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: mocks.send }),
}));

const binding = {
  generation: 1,
  recordingId: 'admission-recording',
  streamInstanceId: 'admission-stream',
};
let controller: typeof import('./controller');
let gate: typeof import('./start/gate');

function createStartParams(sourceCount = 1) {
  return {
    ...binding,
    streamId: 'desktop-stream',
    settings: {
      ...DEFAULT_VIDEO_SETTINGS,
      countdownSeconds: 0,
      microphoneEnabled: false,
      sourceCount,
    },
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.startSingleSource.mockReset();
  mocks.startMultiSource.mockReset();
  controller = await import('./controller');
  gate = await import('./start/gate');
});

afterEach(() => {
  gate.cancelRecordingBegin();
  vi.useRealTimers();
});

it('retains an early bound BEGIN through multi-source data preparation', async () => {
  const params = createStartParams(2);
  mocks.startMultiSource.mockImplementationOnce(async (prepared) => {
    await gate.waitForRecordingBegin(prepared);
  });

  await controller.startRecording(params, async () => {
    gate.allowRecordingBegin(binding);
  });

  expect(mocks.startMultiSource).toHaveBeenCalledWith(
    {
      ...binding,
      settings: { ...params.settings, systemAudioEnabled: false },
    },
    expect.objectContaining({ sendRuntimeMessage: mocks.send })
  );
});

it('keeps BEGIN available through slow preparation and the full countdown', async () => {
  vi.useFakeTimers();
  const params = createStartParams();
  params.settings.countdownSeconds = 10;
  mocks.startSingleSource.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 33_000));
    await gate.waitForRecordingBegin(binding, 10_000);
  });

  const pending = controller.startRecording(
    params,
    () => new Promise<void>((resolve) => setTimeout(resolve, 11_000))
  );
  const observed = pending.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(54_000);
  gate.allowRecordingBegin(binding);

  await expect(observed).resolves.toBeUndefined();
});
