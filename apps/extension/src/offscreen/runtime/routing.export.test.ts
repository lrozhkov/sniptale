import { beforeEach, expect, it, vi } from 'vitest';

const {
  cancelProjectExportMock,
  consumeProjectExportInputMock,
  disposeMultiSourceDesktopMediaMock,
  getProjectExportCapabilitiesMock,
  parseOffscreenRuntimeMessageMock,
  pauseRecordingMock,
  reconcileProjectExportJobsMock,
  requestDesktopMediaMock,
  resumeRecordingMock,
  setViewportDrawStateMock,
  startProjectExportMock,
  startRecordingMock,
  stopRecordingMock,
  updateViewportCropMock,
} = vi.hoisted(() => ({
  cancelProjectExportMock: vi.fn(),
  consumeProjectExportInputMock: vi.fn(),
  disposeMultiSourceDesktopMediaMock: vi.fn(),
  getProjectExportCapabilitiesMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  reconcileProjectExportJobsMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  setViewportDrawStateMock: vi.fn(),
  startProjectExportMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  updateViewportCropMock: vi.fn(),
}));

vi.mock('../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contracts/messaging/parsers/boundary')>()),
  parseOffscreenRuntimeMessage: parseOffscreenRuntimeMessageMock,
}));

vi.mock('../recording/setup/desktop-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/setup/desktop-media')>()),
  disposeMultiSourceDesktopMedia: disposeMultiSourceDesktopMediaMock,
  requestDesktopMedia: requestDesktopMediaMock,
}));

vi.mock('../recording/controller', () => ({
  pauseRecording: pauseRecordingMock,
  resumeRecording: resumeRecordingMock,
  setViewportDrawState: setViewportDrawStateMock,
  startRecording: startRecordingMock,
  stopRecording: stopRecordingMock,
  updateViewportCrop: updateViewportCropMock,
}));

vi.mock('../project-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project-export')>()),
  cancelProjectExport: cancelProjectExportMock,
  getProjectExportCapabilities: getProjectExportCapabilitiesMock,
  reconcileProjectExportJobs: reconcileProjectExportJobsMock,
  startProjectExport: startProjectExportMock,
}));

vi.mock('../../composition/persistence/project-export-inputs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/project-export-inputs')>()),
  consumeProjectExportInput: consumeProjectExportInputMock,
}));

import {
  handleOffscreenRuntimeMessage,
  parseOffscreenRuntimeMessageOrNull,
  resolveOffscreenErrorPhase,
  resolveOffscreenRuntimeResponseMode,
} from './routing';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createExportSettings,
  createProject,
  createProjectExportInputReference,
} from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  cancelProjectExportMock.mockResolvedValue(undefined);
  consumeProjectExportInputMock.mockResolvedValue(createProject());
  getProjectExportCapabilitiesMock.mockResolvedValue({ formats: [] });
  requestDesktopMediaMock.mockResolvedValue(undefined);
  startProjectExportMock.mockResolvedValue(undefined);
  startRecordingMock.mockResolvedValue(undefined);
  stopRecordingMock.mockResolvedValue(undefined);
});

function createRecordingSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: false,
  };
}

async function routeRecordingRuntimeMessages(): Promise<void> {
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    capabilityToken: 'test-capability',
    captureMode: CaptureMode.TAB,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    controlledCursorCaptureEnabled: true,
    desktopLabel: 'Window 2',
    desktopStreamId: 'desktop-2',
    sourceCount: 2,
    sourceIndex: 1,
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
    capabilityToken: 'test-capability',
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'test-capability',
    streamId: 'stream-1',
    settings: createRecordingSettings(),
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
    capabilityToken: 'test-capability',
    targetResolution: { width: 1280, height: 720 },
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    capabilityToken: 'test-capability',
    frozen: true,
    navigationEpoch: 3,
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
    capabilityToken: 'test-capability',
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
    capabilityToken: 'test-capability',
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    capabilityToken: 'test-capability',
    discard: true,
  });
}

async function routeProjectExportRuntimeMessages(sendResponse: (response?: unknown) => void) {
  const settings = createExportSettings();

  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
    capabilityToken: 'test-capability',
    input: createProjectExportInputReference(),
    jobId: 'job-1',
    settings,
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
    capabilityToken: 'test-capability',
    jobId: 'job-1',
  });
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      capabilityToken: 'test-capability',
      settings,
    },
    sendResponse
  );
}

it('classifies handled offscreen export message phases and response modes', () => {
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT)).toBe(
    'export'
  );
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_STOP_RECORDING)).toBe('stop');
  expect(resolveOffscreenErrorPhase(VideoMessageType.GET_DESKTOP_MEDIA)).toBe('runtime');
  expect(resolveOffscreenErrorPhase(VideoMessageType.DISPOSE_DESKTOP_MEDIA)).toBe('runtime');
  expect(
    resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES)
  ).toBe('manual');
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_START_RECORDING)).toBe(
    'immediate-ack'
  );
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.DISPOSE_DESKTOP_MEDIA)).toBe(
    'deferred-ack'
  );
  expect(
    resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT)
  ).toBe('deferred-ack');
});

it('parses only handled offscreen runtime messages and reports invalid input', () => {
  const logInvalidMessage = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementationOnce((message: unknown) => message);

  expect(
    parseOffscreenRuntimeMessageOrNull({
      logInvalidMessage,
      message: { type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT, jobId: 'job-1' },
    })
  ).toEqual({ type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT, jobId: 'job-1' });

  parseOffscreenRuntimeMessageMock.mockImplementationOnce((message: unknown) => message);
  expect(
    parseOffscreenRuntimeMessageOrNull({
      logInvalidMessage,
      message: { type: MessageType.EXPORT_CAPTURE_FULL_PAGE },
    })
  ).toBeNull();

  parseOffscreenRuntimeMessageMock.mockImplementationOnce(() => {
    throw new Error('bad message');
  });
  expect(parseOffscreenRuntimeMessageOrNull({ logInvalidMessage, message: {} })).toBeNull();
  expect(logInvalidMessage).toHaveBeenCalledWith(expect.any(Error));
});

it('routes recording and project export runtime messages to their owners', async () => {
  const sendResponse = vi.fn();
  const settings = createExportSettings();

  await routeRecordingRuntimeMessages();
  await routeProjectExportRuntimeMessages(sendResponse);

  expect(requestDesktopMediaMock).toHaveBeenCalledWith(CaptureMode.TAB, true, {
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    desktopLabel: 'Window 2',
    desktopStreamId: 'desktop-2',
    sourceCount: 2,
    sourceIndex: 1,
  });
  expect(disposeMultiSourceDesktopMediaMock).toHaveBeenCalledOnce();
  expect(startRecordingMock).toHaveBeenCalledWith({
    streamId: 'stream-1',
    settings: createRecordingSettings(),
  });
  expect(updateViewportCropMock).toHaveBeenCalledWith({
    targetResolution: { width: 1280, height: 720 },
  });
  expect(setViewportDrawStateMock).toHaveBeenCalledWith({ frozen: true, navigationEpoch: 3 });
  expect(pauseRecordingMock).toHaveBeenCalledOnce();
  expect(resumeRecordingMock).toHaveBeenCalledOnce();
  expect(stopRecordingMock).toHaveBeenCalledWith(true);
  expect(startProjectExportMock).toHaveBeenCalledWith('job-1', createProject(), settings);
  expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
  expect(reconcileProjectExportJobsMock).toHaveBeenCalledOnce();
  expect(reconcileProjectExportJobsMock.mock.invocationCallOrder[0]).toBeLessThan(
    getProjectExportCapabilitiesMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(sendResponse).toHaveBeenCalledWith({ success: true, capabilities: { formats: [] } });
});
