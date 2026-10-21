import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { runVideoRecordingSurfaceCommand } from './commands';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  mutate: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  validate: vi.fn(() => true),
}));
vi.mock('../../../../composition/persistence/capture-settings', () => ({
  loadVideoSettings: async () => DEFAULT_VIDEO_SETTINGS,
  patchVideoSettings: mocks.patch,
  mutateVideoSettings: mocks.mutate,
}));
vi.mock('./surface-lease', () => ({
  ensureVideoRecordingSurfaceLeaseHydrated: async () => ({ surfaceSessionId: 'surface-1' }),
  validateVideoRecordingSurfaceCapability: mocks.validate,
  updateVideoRecordingSurface: vi.fn(),
}));
vi.mock('./snapshot', () => ({ createVideoRecordingSurfaceSnapshot: () => ({}) }));
vi.mock('./start', () => ({ cancelSavedTabVideoRecordingStart: vi.fn() }));
vi.mock('./camera-peer', () => ({
  listVideoRecordingMediaDevices: mocks.list,
  closeVideoRecordingCameraPeerForLease: vi.fn(),
  switchVideoRecordingCameraPeerInput: vi.fn(),
}));
vi.mock('../runtime/manager/controls', () => ({
  cancelRecordingStart: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  updateRecordingSettings: mocks.update,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validate.mockReturnValue(true);
  vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } });
});
afterEach(() => vi.unstubAllGlobals());

const base = {
  type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
  surfaceSessionId: 'surface-1',
  surfaceToken: 'token-1',
  capabilityEpoch: 1,
  documentGeneration: 1,
  recordingId: null,
} as const;

it.each(['audioinput', 'videoinput'] as const)(
  'requires access before listing or enabling %s without effects',
  async (deviceKind) => {
    for (const requestPermission of [false, true]) {
      const result = await runVideoRecordingSurfaceCommand(12, {
        ...base,
        command: { kind: 'list-media-devices', deviceKind, requestPermission },
      });
      expect(result.result).toEqual({ mediaDevices: [], permissionRequired: true });
    }
    const enable = await runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: {
        kind: deviceKind === 'audioinput' ? 'set-microphone-enabled' : 'set-webcam-enabled',
        enabled: true,
      },
    });
    expect(enable.result).toEqual({ result: 'permission-required', permissionRequired: true });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  }
);

it('keeps full lease admission ahead of permission discovery', async () => {
  mocks.validate.mockReturnValue(false);
  await expect(
    runVideoRecordingSurfaceCommand(12, {
      ...base,
      command: { kind: 'list-media-devices', deviceKind: 'audioinput', requestPermission: false },
    })
  ).rejects.toThrow('Unauthorized or stale');
  expect(navigator.permissions.query).not.toHaveBeenCalled();
});
