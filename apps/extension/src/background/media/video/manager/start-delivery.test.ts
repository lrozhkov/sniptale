import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activateLease: vi.fn(),
  beginPreparedRecording: vi.fn(),
  scheduleWatchdog: vi.fn(),
  enableHistory: vi.fn(),
  issueLaunchToken: vi.fn(),
  openCompanion: vi.fn(),
}));

vi.mock('../runtime/manager/controlled-cursor/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/manager/controlled-cursor/messages')>()),
  enableControlledCursorCapture: mocks.enableHistory,
}));

vi.mock('../runtime/camera-recorder-control', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/camera-recorder-control')>()),
  issueCameraRecorderLaunchToken: mocks.issueLaunchToken,
}));

vi.mock('../../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage: mocks.openCompanion,
}));

vi.mock('../recording-control-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording-control-lease')>()),
  activateVideoRecordingLease: mocks.activateLease,
}));
vi.mock('./flow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./flow')>()),
  beginPreparedRecording: mocks.beginPreparedRecording,
}));
vi.mock('./start-activation-watchdog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./start-activation-watchdog')>()),
  scheduleRecordingStartActivationWatchdog: mocks.scheduleWatchdog,
}));

import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { finalizeAcceptedRecordingStart } from './start-delivery';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginPreparedRecording.mockResolvedValue(undefined);
  mocks.activateLease.mockResolvedValue({ controlToken: 'active-token' });
  mocks.enableHistory.mockResolvedValue(undefined);
  mocks.issueLaunchToken.mockResolvedValue('launch-token');
  mocks.openCompanion.mockResolvedValue(undefined);
});

it('activates the recorder without a helper capability or receipt-time history reset', async () => {
  await finalizeAcceptedRecordingStart(
    'recording-1',
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      tabId: 7,
      settings: {},
      viewportPresetId: null,
    },
    'stream-1'
  );
  expect(mocks.beginPreparedRecording).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
  expect(mocks.enableHistory).not.toHaveBeenCalled();
});

it('keeps an accepted video recording when optional action history is unavailable', async () => {
  mocks.enableHistory.mockRejectedValueOnce(new Error('No receiver'));
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB_CROP,
        generation: 3,
        tabId: 7,
        settings: {},
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ result: 'accepted' });
  expect(mocks.activateLease).toHaveBeenCalledOnce();
});

it('publishes the active lease only after the bound recorder begin succeeds', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        settings: {},
        viewportPresetId: 'preset-1',
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ controlToken: 'active-token', result: 'accepted' });

  expect(mocks.beginPreparedRecording.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.activateLease.mock.invocationCallOrder[0]!
  );
  expect(mocks.activateLease).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
});

it('leaves identity-bound cleanup to the start owner when activation persistence fails', async () => {
  mocks.activateLease.mockRejectedValueOnce(new Error('activation persistence failed'));

  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        tabId: 7,
        settings: {},
        viewportPresetId: 'preset-1',
      },
      'stream-1'
    )
  ).rejects.toThrow('activation persistence failed');

  expect(mocks.enableHistory).not.toHaveBeenCalled();
  expect(mocks.scheduleWatchdog).not.toHaveBeenCalled();
});

it('activates a prepared multi-source recording through its bound begin command', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.SCREEN,
        generation: 3,
        settings: { sourceCount: 2 },
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ controlToken: 'active-token', result: 'accepted' });

  expect(mocks.beginPreparedRecording).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
  expect(mocks.activateLease).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
});

it('never publishes active authority after a failed BEGIN delivery', async () => {
  mocks.beginPreparedRecording.mockRejectedValueOnce(new Error('BEGIN transport failed'));
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        tabId: 7,
        settings: {},
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).rejects.toThrow('BEGIN transport failed');
  expect(mocks.beginPreparedRecording).toHaveBeenCalledWith({
    generation: 3,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
  });
  expect(mocks.activateLease).not.toHaveBeenCalled();
});

it.each(Object.values(CaptureMode))(
  'issues a companion launch token for teleprompter in %s capture',
  async (captureMode) => {
    await expect(
      finalizeAcceptedRecordingStart(
        'recording-1',
        {
          captureMode,
          generation: 3,
          settings: { teleprompterEnabled: true },
          viewportPresetId: null,
        },
        'stream-1'
      )
    ).resolves.toMatchObject({ cameraLaunchToken: 'launch-token', result: 'accepted' });
    expect(mocks.issueLaunchToken).toHaveBeenCalledWith('recording-1');
    expect(mocks.openCompanion).toHaveBeenCalledWith({
      launchToken: 'launch-token',
      recordingId: 'recording-1',
      teleprompter: true,
    });
  }
);
it('keeps the companion closed for ordinary tab recording', async () => {
  const result = await finalizeAcceptedRecordingStart(
    'recording-1',
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      settings: {},
      viewportPresetId: null,
    },
    'stream-1'
  );
  expect(result).not.toHaveProperty('cameraLaunchToken');
  expect(mocks.issueLaunchToken).not.toHaveBeenCalled();
  expect(mocks.openCompanion).not.toHaveBeenCalled();
});
it('keeps the camera companion available without teleprompter', async () => {
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.CAMERA,
        generation: 3,
        settings: {},
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({ cameraLaunchToken: 'launch-token' });
});

it('delivers the companion before returning acceptance to a disposable popup', async () => {
  const entered = Promise.withResolvers<void>();
  const opening = Promise.withResolvers<void>();
  mocks.openCompanion.mockImplementationOnce(() => {
    entered.resolve();
    return opening.promise;
  });
  const delivery = finalizeAcceptedRecordingStart(
    'recording-1',
    {
      captureMode: CaptureMode.TAB,
      generation: 3,
      settings: { teleprompterEnabled: true },
      viewportPresetId: null,
    },
    'stream-1'
  );
  expect(
    await Promise.race([entered.promise.then(() => 'opening'), delivery.then(() => 'returned')])
  ).toBe('opening');
  opening.resolve();
  await expect(delivery).resolves.toMatchObject({ cameraRecorderOpened: true, result: 'accepted' });
  expect(mocks.issueLaunchToken.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.openCompanion.mock.invocationCallOrder[0]!
  );
});
it('preserves an accepted recording and fallback token when background delivery fails', async () => {
  mocks.openCompanion.mockRejectedValueOnce(new Error('window unavailable'));
  await expect(
    finalizeAcceptedRecordingStart(
      'recording-1',
      {
        captureMode: CaptureMode.TAB,
        generation: 3,
        settings: { teleprompterEnabled: true },
        viewportPresetId: null,
      },
      'stream-1'
    )
  ).resolves.toMatchObject({
    cameraRecorderOpened: false,
    cameraLaunchToken: 'launch-token',
    controlToken: 'active-token',
    result: 'accepted',
  });
});
