import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { runSerializedVideoRecordingMediaMutation } from './mutation-queue';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  ensurePageAccess: vi.fn(),
  ensureHeadroom: vi.fn(),
  loadVideoSettings: vi.fn(),
  patchVideoSettings: vi.fn(),
  startRecording: vi.fn(),
  openPopup: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: { openPopup: mocks.openPopup },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: vi.fn(async () => ({ active: true, windowId: 7 })) },
}));

vi.mock('../../../../composition/persistence/capture-settings', () => ({
  loadVideoSettings: mocks.loadVideoSettings,
  loadVideoUiState: vi.fn(async () => ({ viewportPresetId: 'preset-1' })),
  patchVideoSettings: mocks.patchVideoSettings,
}));
vi.mock('../../../../composition/persistence/settings', () => ({
  loadSettings: vi.fn(async () => ({ viewportPresets: [] })),
}));
vi.mock('../../../../features/media-hub/storage-capacity', () => ({
  ensureMediaHubStorageHeadroom: mocks.ensureHeadroom,
}));
vi.mock('../../../page-access/service', () => ({
  ensureActivePageAccessRuntime: mocks.ensurePageAccess,
}));
vi.mock('../manager', () => ({ startRecording: mocks.startRecording }));
vi.mock('./preset', () => ({
  resolveVideoRecordingViewportPreset: vi.fn(async () => 'preset-1'),
}));
vi.mock('./surface-lease', () => ({
  ensureVideoRecordingSurfaceLeaseHydrated: vi.fn(async () => ({
    surfaceSessionId: 'surface-1',
    surfaceToken: 'surface-token-1',
    tabId: 12,
  })),
  requestVideoRecordingSurface: vi.fn(),
  updateVideoRecordingSurface: vi.fn(async (surfaceSessionId, update) => ({
    surfaceSessionId,
    surfaceToken: 'surface-token-1',
    tabId: 12,
    ...update,
  })),
}));
vi.mock('./snapshot', () => ({
  createVideoRecordingSurfaceSnapshot: vi.fn(() => ({ surfaceSessionId: 'surface-1' })),
}));
vi.mock('@sniptale/platform/browser/web-navigation', () => ({
  browserWebNavigation: { getAllFrames: vi.fn(async () => [{ frameId: 0, documentId: 'doc-12' }]) },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() }),
}));

import {
  cancelSavedTabVideoRecordingStart,
  startSavedTabVideoRecording,
  isSavedTabVideoRecordingStartPending,
} from './start';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadVideoSettings.mockResolvedValue(DEFAULT_VIDEO_SETTINGS);
  mocks.patchVideoSettings.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    warnWithoutMicrophone: false,
  });
  mocks.startRecording.mockResolvedValue({ result: 'accepted', recordingId: 'recording-1' });
  mocks.ensurePageAccess.mockResolvedValue(undefined);
  mocks.ensureHeadroom.mockResolvedValue(undefined);
});

it('owns pending-start admission before reading settings and clears it on completion', async () => {
  let release!: (settings: typeof DEFAULT_VIDEO_SETTINGS) => void;
  const gate = new Promise<typeof DEFAULT_VIDEO_SETTINGS>((resolve) => {
    release = resolve;
  });
  mocks.loadVideoSettings.mockReturnValueOnce(gate);
  expect(isSavedTabVideoRecordingStartPending(12)).toBe(false);
  const pending = startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
    confirmedWithoutMicrophone: true,
  });
  expect(isSavedTabVideoRecordingStartPending(12)).toBe(true);
  expect(isSavedTabVideoRecordingStartPending(13)).toBe(false);
  expect(mocks.startRecording).not.toHaveBeenCalled();
  release(DEFAULT_VIDEO_SETTINGS);
  await pending;
  expect(isSavedTabVideoRecordingStartPending(12)).toBe(false);
});

it('requires confirmation before page access, storage admission, or recording acquisition', async () => {
  await expect(
    startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12')
  ).resolves.toEqual({ success: true, confirmationRequired: true });
  expect(mocks.startRecording).not.toHaveBeenCalled();
  expect(mocks.ensurePageAccess).not.toHaveBeenCalled();
  expect(mocks.ensureHeadroom).not.toHaveBeenCalled();
  expect(mocks.patchVideoSettings).not.toHaveBeenCalled();
});

it('does not treat saved enabled sources as available when permission is absent', async () => {
  mocks.loadVideoSettings.mockResolvedValue({
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    webcamEnabled: true,
  });
  await expect(
    startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12')
  ).resolves.toEqual({ success: true, confirmationRequired: true });
  expect(mocks.startRecording).not.toHaveBeenCalled();
  expect(mocks.patchVideoSettings).not.toHaveBeenCalled();
});

it('opens the video popup when a previous recording must be resolved', async () => {
  mocks.startRecording.mockResolvedValueOnce({
    error: 'Resolve the previous recording before starting another.',
    result: 'failed',
  });
  const response = await startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
    confirmedWithoutMicrophone: true,
  });
  expect(response).toMatchObject({ failureCode: 'already-active', success: false });
  expect(mocks.openPopup).toHaveBeenCalledWith({ windowId: 7 });
});

it('remembers confirmed no-microphone recording through the existing settings writer', async () => {
  await startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
    confirmedWithoutMicrophone: true,
    rememberWithoutMicrophone: true,
  });
  expect(mocks.patchVideoSettings).toHaveBeenCalledExactlyOnceWith({
    warnWithoutMicrophone: false,
  });
  expect(mocks.startRecording).toHaveBeenCalledWith(
    12,
    { ...DEFAULT_VIDEO_SETTINGS, warnWithoutMicrophone: false },
    CaptureMode.TAB,
    'preset-1',
    'https://example.test/page',
    'doc-12'
  );
});

it('does not acquire recording when the remembered-choice write fails', async () => {
  mocks.patchVideoSettings.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(
    startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
      confirmedWithoutMicrophone: true,
      rememberWithoutMicrophone: true,
    })
  ).rejects.toThrow('Storage unavailable');
  expect(mocks.startRecording).not.toHaveBeenCalled();
  expect(mocks.ensurePageAccess).not.toHaveBeenCalled();
});

it('cancels a remembered-choice write without starting after the write completes', async () => {
  let finishWrite!: (settings: typeof DEFAULT_VIDEO_SETTINGS) => void;
  mocks.patchVideoSettings.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWrite = resolve;
      })
  );
  const started = startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
    confirmedWithoutMicrophone: true,
    rememberWithoutMicrophone: true,
  });
  await vi.waitFor(() => expect(mocks.patchVideoSettings).toHaveBeenCalledOnce());
  cancelSavedTabVideoRecordingStart(12);
  finishWrite({ ...DEFAULT_VIDEO_SETTINGS, warnWithoutMicrophone: false });
  await expect(started).resolves.toEqual({ success: false, failureCode: 'cancelled' });
  expect(mocks.startRecording).not.toHaveBeenCalled();
});

it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
  'starts the selected %s source through the canonical manager after confirmation',
  async (captureMode) => {
    await expect(
      startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', { captureMode })
    ).resolves.toEqual({ success: true, confirmationRequired: true });
    expect(mocks.startRecording).not.toHaveBeenCalled();
    await startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
      captureMode,
      confirmedWithoutMicrophone: true,
    });
    expect(mocks.startRecording).toHaveBeenCalledWith(
      12,
      DEFAULT_VIDEO_SETTINGS,
      captureMode,
      'preset-1',
      'https://example.test/page',
      'doc-12'
    );
  }
);

it('waits for an admitted output write before loading confirmed start settings', async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const write = runSerializedVideoRecordingMediaMutation('surface-1', async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.loadVideoSettings.mockResolvedValue({
      ...DEFAULT_VIDEO_SETTINGS,
      outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, frameRate: 60 },
    });
  });
  await ready;
  const starting = startSavedTabVideoRecording(12, 'https://example.test/page', 'doc-12', {
    confirmedWithoutMicrophone: true,
  });
  expect(isSavedTabVideoRecordingStartPending(12)).toBe(true);
  expect(mocks.loadVideoSettings).not.toHaveBeenCalled();
  release();
  await Promise.all([write, starting]);
  expect(mocks.startRecording).toHaveBeenCalledWith(
    12,
    expect.objectContaining({ outputProfile: expect.objectContaining({ frameRate: 60 }) }),
    CaptureMode.TAB,
    'preset-1',
    'https://example.test/page',
    'doc-12'
  );
});
