import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { openCameraRecorderPage, requestMicrophonePermission, requestWebcamPermission } = vi.hoisted(
  () => ({
    openCameraRecorderPage: vi.fn(),
    requestMicrophonePermission: vi.fn(),
    requestWebcamPermission: vi.fn(),
  })
);

vi.mock('../../recording/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/microphone')>()),
  requestMicrophonePermission,
}));
vi.mock('../../recording/webcam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/webcam')>()),
  requestWebcamPermission,
}));
vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage,
}));

vi.mock('../../recording/media-devices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/media-devices')>()),
  readPopupMediaAccessState: vi.fn().mockResolvedValue('granted'),
}));

const defaultSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  autoFadeDelay: 3,
  controlledCursorCaptureEnabled: true,
  countdownSeconds: 3,
  interactionDiagnosticsEnabled: true,
  microphoneDeviceId: null,
  microphoneEnabled: false,
  sourceCount: 3,
  systemAudioEnabled: true,
  webcamDeviceId: 'cam-1',
  webcamEnabled: false,
};

const setIsStartPending = vi.fn();
const setRecordingControlCapability = vi.fn();
const setStartError = vi.fn();
const tabsQuery = vi.fn();
const runtimeSendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  runtimeSendMessage.mockResolvedValue({
    cameraLaunchToken: 'launch-token-1',
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
    result: 'accepted',
    success: true,
  });
  openCameraRecorderPage.mockResolvedValue(undefined);
  Object.assign(globalThis, {
    chrome: {
      runtime: { sendMessage: runtimeSendMessage },
      tabs: { query: tabsQuery },
    },
  });
});

describe('startRecordingHandler camera mode', () => {
  it('starts camera recording without active tab resolution', async () => {
    await startRecordingHandler({
      captureMode: CaptureMode.CAMERA,
      microphoneDevices: [],
      setIsStartPending,
      setRecordingControlCapability,
      setStartError,
      videoSettings: defaultSettings,
      viewportPresetId: 'retained-tab-preset',
      webcamDevices: [{ deviceId: 'cam-1', label: 'Camera 1' }],
    });

    expect(tabsQuery).not.toHaveBeenCalled();
    expect(requestWebcamPermission).toHaveBeenCalledWith('cam-1');
    expect(runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: CaptureMode.CAMERA,
        viewportPresetId: null,
        settings: expect.objectContaining({
          controlledCursorCaptureEnabled: false,
          interactionDiagnosticsEnabled: false,
          sourceCount: 1,
          systemAudioEnabled: false,
          webcamDeviceId: 'cam-1',
          webcamEnabled: true,
        }),
        type: VideoMessageType.START_RECORDING,
      })
    );
    expect(openCameraRecorderPage).toHaveBeenCalledWith({
      launchToken: 'launch-token-1',
      recordingId: 'recording-1',
    });
  });
});

describe('teleprompter companion launch', () => {
  it.each([CaptureMode.TAB, CaptureMode.TAB_CROP, CaptureMode.SCREEN])(
    'opens a script-only companion for %s capture',
    async (captureMode) => {
      tabsQuery.mockResolvedValue([{ id: 7 }]);
      await startRecordingHandler({
        captureMode,
        microphoneDevices: [],
        webcamDevices: [],
        setIsStartPending,
        setRecordingControlCapability,
        setStartError,
        videoSettings: { ...defaultSettings, teleprompterEnabled: true },
        viewportPresetId: null,
      });
      expect(requestWebcamPermission).not.toHaveBeenCalled();
      expect(openCameraRecorderPage).toHaveBeenCalledWith({
        launchToken: 'launch-token-1',
        recordingId: 'recording-1',
        teleprompter: true,
      });
      expect(runtimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ teleprompterEnabled: true, webcamEnabled: false }),
        })
      );
    }
  );
  it('reports companion failure while preserving accepted recording control', async () => {
    tabsQuery.mockResolvedValue([{ id: 7 }]);
    openCameraRecorderPage.mockRejectedValueOnce(new Error('window unavailable'));
    await startRecordingHandler({
      captureMode: CaptureMode.TAB,
      microphoneDevices: [],
      webcamDevices: [],
      setIsStartPending,
      setRecordingControlCapability,
      setStartError,
      videoSettings: { ...defaultSettings, teleprompterEnabled: true },
      viewportPresetId: null,
    });
    expect(setRecordingControlCapability).toHaveBeenLastCalledWith({
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    });
    expect(setStartError).toHaveBeenCalled();
  });
});

it.each([CaptureMode.CAMERA, CaptureMode.TAB])(
  'does not open a duplicate companion after background delivery for %s',
  async (captureMode) => {
    tabsQuery.mockResolvedValue([{ id: 7 }]);
    runtimeSendMessage.mockResolvedValueOnce({
      success: true,
      result: 'accepted',
      cameraRecorderOpened: true,
      cameraLaunchToken: 'launch-token-1',
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    });
    await startRecordingHandler({
      captureMode,
      microphoneDevices: [],
      webcamDevices: [],
      setIsStartPending,
      setRecordingControlCapability,
      setStartError,
      videoSettings: { ...defaultSettings, teleprompterEnabled: true },
      viewportPresetId: null,
    });
    expect(openCameraRecorderPage).not.toHaveBeenCalled();
    expect(setRecordingControlCapability).toHaveBeenLastCalledWith({
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    });
    expect(setStartError).not.toHaveBeenCalled();
  }
);
it('retries companion delivery when the background reports opening failure', async () => {
  tabsQuery.mockResolvedValue([{ id: 7 }]);
  runtimeSendMessage.mockResolvedValueOnce({
    success: true,
    result: 'accepted',
    cameraRecorderOpened: false,
    cameraLaunchToken: 'launch-token-1',
    controlToken: 'control-token-1',
    recordingId: 'recording-1',
  });
  await startRecordingHandler({
    captureMode: CaptureMode.TAB,
    microphoneDevices: [],
    webcamDevices: [],
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings: { ...defaultSettings, teleprompterEnabled: true },
    viewportPresetId: null,
  });
  expect(openCameraRecorderPage).toHaveBeenCalledWith({
    launchToken: 'launch-token-1',
    recordingId: 'recording-1',
    teleprompter: true,
  });
});
