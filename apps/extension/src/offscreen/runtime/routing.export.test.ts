import { beforeEach, expect, it, vi } from 'vitest';

const {
  cancelProjectExportMock,
  consumeProjectExportInputMock,
  allowRecordingBeginMock,
  createSourceVideoMock,
  disposeMultiSourceDesktopMediaMock,
  getProjectExportCapabilitiesMock,
  parseOffscreenRuntimeMessageMock,
  pauseRecordingMock,
  reconcileProjectExportJobsMock,
  requestDesktopMediaMock,
  releaseSourceVideoMock,
  recordingContextMock,
  resumeRecordingMock,
  setViewportDrawStateMock,
  startProjectExportMock,
  startRecordingMock,
  stopRecordingMock,
  updateRecordingSettingsMock,
  updateViewportCropMock,
  waitForSourceMetadataMock,
} = vi.hoisted(() => ({
  cancelProjectExportMock: vi.fn(),
  consumeProjectExportInputMock: vi.fn(),
  allowRecordingBeginMock: vi.fn(),
  createSourceVideoMock: vi.fn(),
  disposeMultiSourceDesktopMediaMock: vi.fn(),
  getProjectExportCapabilitiesMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  reconcileProjectExportJobsMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
  releaseSourceVideoMock: vi.fn(),
  recordingContextMock: {
    sourceStream: null,
    sourceVideoHeight: 720,
    sourceVideoWidth: 1280,
    tabOutputGeometry: null as null | {
      coordinateSpace: { width: number; height: number };
      requestedCrop: { x: number; y: number; width: number; height: number };
      sourceSize: { width: number; height: number };
      sourceRect: { x: number; y: number; width: number; height: number };
      outputSize: { width: number; height: number };
    },
    matchesSourceBinding: vi.fn(() => true),
  },
  resumeRecordingMock: vi.fn(),
  setViewportDrawStateMock: vi.fn(),
  startProjectExportMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  updateRecordingSettingsMock: vi.fn(),
  updateViewportCropMock: vi.fn(),
  waitForSourceMetadataMock: vi.fn(),
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

vi.mock('../recording/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/controller')>()),
  pauseRecording: pauseRecordingMock,
  resumeRecording: resumeRecordingMock,
  setViewportDrawState: setViewportDrawStateMock,
  startRecording: startRecordingMock,
  stopRecording: stopRecordingMock,
  updateRecordingSettings: updateRecordingSettingsMock,
  updateViewportCrop: updateViewportCropMock,
}));

vi.mock('../recording/start/gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/start/gate')>()),
  allowRecordingBegin: allowRecordingBeginMock,
}));

vi.mock('../recording/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/context')>()),
  recordingContext: recordingContextMock,
}));

vi.mock('../recording/stream/video-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/stream/video-source')>()),
  createSourceVideo: createSourceVideoMock,
  releaseSourceVideo: releaseSourceVideoMock,
  waitForSourceMetadata: waitForSourceMetadataMock,
}));

vi.mock('../recording/update-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/update-settings')>()),
  updateRecordingSettings: updateRecordingSettingsMock,
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
  recordingContextMock.sourceStream = null;
  recordingContextMock.sourceVideoHeight = 720;
  recordingContextMock.sourceVideoWidth = 1280;
  recordingContextMock.tabOutputGeometry = null;
  startProjectExportMock.mockResolvedValue(undefined);
  startRecordingMock.mockResolvedValue(undefined);
  stopRecordingMock.mockResolvedValue(undefined);
  waitForSourceMetadataMock.mockResolvedValue(undefined);
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
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
    streamId: 'stream-1',
    settings: createRecordingSettings(),
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
    capabilityToken: 'test-capability',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
    capabilityToken: 'test-capability',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    capabilityToken: 'test-capability',
    discard: true,
    recordingId: 'recording-1',
    generation: 1,
    streamInstanceId: 'stream-instance-1',
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
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_BEGIN_RECORDING)).toBe('runtime');
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE)).toBe('runtime');
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_UPDATE_SETTINGS)).toBe('runtime');
  expect(
    resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES)
  ).toBe('manual');
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_START_RECORDING)).toBe(
    'immediate-ack'
  );
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.DISPOSE_DESKTOP_MEDIA)).toBe(
    'deferred-ack'
  );
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_BEGIN_RECORDING)).toBe(
    'deferred-ack'
  );
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE)).toBe(
    'manual'
  );
  expect(
    resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT)
  ).toBe('deferred-ack');
});

it('routes source gate, live settings, and full exact-surface start arguments', async () => {
  const settings = createRecordingSettings();
  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    capabilityToken: 'test-capability',
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 200, width: 300, x: 10, y: 20 },
    generation: 4,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
    settings,
    streamId: 'stream-1',
    surface: { height: 720, presetId: 'viewport-hd', target: 'viewport', width: 1280 },
    tabId: 7,
    viewport: { devicePixelRatio: 1, height: 720, scrollX: 0, scrollY: 0, width: 1280 },
  });
  expect(startRecordingMock).toHaveBeenLastCalledWith({
    captureMode: CaptureMode.TAB_CROP,
    cropRegion: { height: 200, width: 300, x: 10, y: 20 },
    generation: 4,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
    settings,
    streamId: 'stream-1',
    surface: { height: 720, presetId: 'viewport-hd', target: 'viewport', width: 1280 },
    tabId: 7,
    viewport: { devicePixelRatio: 1, height: 720, scrollX: 0, scrollY: 0, width: 1280 },
  });

  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
    capabilityToken: 'test-capability',
    generation: 4,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  expect(allowRecordingBeginMock).toHaveBeenCalledWith(
    expect.objectContaining({ streamInstanceId: 'stream-instance-1' })
  );

  await handleOffscreenRuntimeMessage({
    type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
    capabilityToken: 'test-capability',
    generation: 4,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
    settings,
  });
  expect(updateRecordingSettingsMock).toHaveBeenCalledWith(
    { generation: 4, recordingId: 'recording-1', streamInstanceId: 'stream-instance-1' },
    settings
  );
});

it('revalidates source metadata and returns typed ALLOW or DENY responses', async () => {
  const sendResponse = vi.fn();
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    sendResponse
  );
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Recording source is unavailable',
    result: 'DENY',
    success: false,
  });

  Object.assign(recordingContextMock, { sourceStream: { id: 'source-stream' } });
  createSourceVideoMock.mockReturnValue({ videoHeight: 720, videoWidth: 1280 });
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    sendResponse
  );
  expect(sendResponse).toHaveBeenLastCalledWith({
    result: 'ALLOW',
    success: true,
    videoHeight: 720,
    videoWidth: 1280,
  });
  expect(releaseSourceVideoMock).toHaveBeenCalled();

  recordingContextMock.tabOutputGeometry = {
    coordinateSpace: { width: 1280, height: 720 },
    requestedCrop: { x: 100, y: 80, width: 300, height: 300 },
    sourceSize: { width: 1280, height: 720 },
    sourceRect: { x: 100, y: 80, width: 300, height: 300 },
    outputSize: { width: 300, height: 300 },
  };
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
      viewport: {
        devicePixelRatio: 1,
        height: 768,
        scrollX: 0,
        scrollY: 0,
        visualViewportScale: 1,
        width: 1024,
      },
    },
    sendResponse
  );
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Recording tab output mapping changed during revalidation',
    result: 'DENY',
    success: false,
  });
  recordingContextMock.tabOutputGeometry = null;

  createSourceVideoMock.mockReturnValueOnce({ videoHeight: 720, videoWidth: 1279 });
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    sendResponse
  );
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'Recording source geometry changed during revalidation',
    result: 'DENY',
    success: false,
  });

  waitForSourceMetadataMock.mockRejectedValueOnce('metadata failed');
  await handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    sendResponse
  );
  expect(sendResponse).toHaveBeenLastCalledWith({
    error: 'metadata failed',
    result: 'DENY',
    success: false,
  });
});

it('denies a stale source binding when the recording changes during metadata loading', async () => {
  let resolveMetadata!: () => void;
  waitForSourceMetadataMock.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveMetadata = resolve;
    })
  );
  const originalStream = { id: 'source-stream-1' };
  Object.assign(recordingContextMock, { sourceStream: originalStream });
  recordingContextMock.matchesSourceBinding.mockReturnValue(true);
  createSourceVideoMock.mockReturnValue({ videoHeight: 720, videoWidth: 1280 });
  const sendResponse = vi.fn();

  const routed = handleOffscreenRuntimeMessage(
    {
      type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
      capabilityToken: 'test-capability',
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    sendResponse
  );
  await vi.waitFor(() => expect(waitForSourceMetadataMock).toHaveBeenCalledOnce());
  Object.assign(recordingContextMock, { sourceStream: { id: 'source-stream-2' } });
  recordingContextMock.matchesSourceBinding.mockReturnValue(false);
  resolveMetadata();
  await routed;

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Recording source geometry changed during revalidation',
    result: 'DENY',
    success: false,
  });
  expect(releaseSourceVideoMock).toHaveBeenCalledWith(
    expect.objectContaining({ videoHeight: 720, videoWidth: 1280 })
  );
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
    generation: 1,
    recordingId: 'recording-1',
    streamId: 'stream-1',
    streamInstanceId: 'stream-instance-1',
    settings: createRecordingSettings(),
  });
  expect(pauseRecordingMock).toHaveBeenCalledOnce();
  expect(resumeRecordingMock).toHaveBeenCalledOnce();
  expect(stopRecordingMock).toHaveBeenCalledWith(
    {
      generation: 1,
      recordingId: 'recording-1',
      streamInstanceId: 'stream-instance-1',
    },
    true
  );
  expect(startProjectExportMock).toHaveBeenCalledWith('job-1', createProject(), settings);
  expect(cancelProjectExportMock).toHaveBeenCalledWith('job-1');
  expect(reconcileProjectExportJobsMock).toHaveBeenCalledOnce();
  expect(reconcileProjectExportJobsMock.mock.invocationCallOrder[0]).toBeLessThan(
    getProjectExportCapabilitiesMock.mock.invocationCallOrder[0] ?? 0
  );
  expect(sendResponse).toHaveBeenCalledWith({ success: true, capabilities: { formats: [] } });
});
