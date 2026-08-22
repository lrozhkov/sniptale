import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireRasterInput: vi.fn(),
  allowBegin: vi.fn(),
  assertBegin: vi.fn(),
  cancelBegin: vi.fn(),
  cancelDesktopFrame: vi.fn(),
  captureDesktopFrame: vi.fn(),
  cleanupRasterJobs: vi.fn(),
  closeCamera: vi.fn(),
  completeRasterJob: vi.fn(),
  deleteRasterJob: vi.fn(),
  disposeDesktopMedia: vi.fn(),
  handleProjectExport: vi.fn(),
  listMediaDevices: vi.fn(),
  pause: vi.fn(),
  rasterize: vi.fn(),
  reserveDesktopFrame: vi.fn(),
  resume: vi.fn(),
  setClipboard: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  switchCamera: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../recording/controller', () => ({
  pauseRecording: mocks.pause,
  resumeRecording: mocks.resume,
  startRecording: mocks.start,
  stopRecording: mocks.stop,
  updateRecordingSettings: mocks.update,
}));
vi.mock('../recording/start/gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/start/gate')>()),
  allowRecordingBegin: mocks.allowBegin,
  assertRecordingBegin: mocks.assertBegin,
  cancelRecordingBegin: mocks.cancelBegin,
}));
vi.mock('../recording/setup/desktop-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/setup/desktop-media')>()),
  disposeMultiSourceDesktopMedia: mocks.disposeDesktopMedia,
  requestDesktopMedia: vi.fn(),
}));
vi.mock('../recording/camera-source/peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/camera-source/peer')>()),
  closeCameraSourcePeer: mocks.closeCamera,
  switchCameraSourcePeerInput: mocks.switchCamera,
}));
vi.mock('../recording/camera-source/device-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../recording/camera-source/device-catalog')>()),
  listVideoRecordingMediaDevices: mocks.listMediaDevices,
}));
vi.mock('../../composition/persistence/frame-annotation-raster-jobs', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../composition/persistence/frame-annotation-raster-jobs')
  >()),
  acquireFrameAnnotationRasterInput: mocks.acquireRasterInput,
  cleanupFrameAnnotationRasterJobs: mocks.cleanupRasterJobs,
  completeFrameAnnotationRasterJob: mocks.completeRasterJob,
  deleteFrameAnnotationRasterJob: mocks.deleteRasterJob,
}));
vi.mock('../frame-annotation-rasterizer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../frame-annotation-rasterizer')>()),
  FrameAnnotationRasterizer: class {
    rasterize = mocks.rasterize;
  },
}));
vi.mock('../media/desktop-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media/desktop-frame')>()),
  cancelDesktopFrame: mocks.cancelDesktopFrame,
  captureDesktopFrame: mocks.captureDesktopFrame,
  reserveDesktopFrame: mocks.reserveDesktopFrame,
  writeDesktopFrameClipboard: mocks.setClipboard,
}));
vi.mock('./routing.project-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./routing.project-export')>()),
  handleProjectExportRuntimeMessage: mocks.handleProjectExport,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  handleOffscreenRuntimeMessage,
  resolveOffscreenErrorPhase,
  resolveOffscreenRuntimeResponseMode,
} from './routing';
import { createExportSettings } from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireRasterInput.mockResolvedValue({ source: 'raster-input' });
  mocks.captureDesktopFrame.mockResolvedValue({ dataUrl: 'data:image/png;base64,frame' });
  mocks.deleteRasterJob.mockResolvedValue(undefined);
  mocks.listMediaDevices.mockResolvedValue([
    { deviceId: 'camera-1', kind: 'videoinput', label: 'Camera 1' },
  ]);
  mocks.rasterize.mockResolvedValue({
    blob: new Blob(['raster']),
    metadata: { height: 10, width: 20 },
  });
  mocks.reserveDesktopFrame.mockResolvedValue({ reference: { requestId: 'frame-1' } });
  mocks.start.mockResolvedValue(undefined);
});

it('classifies the remaining recording command phases and response modes', () => {
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_STOP_RECORDING)).toBe('stop');
  expect(resolveOffscreenErrorPhase(VideoMessageType.OFFSCREEN_BEGIN_RECORDING)).toBe('runtime');
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_START_RECORDING)).toBe(
    'immediate-ack'
  );
  expect(resolveOffscreenRuntimeResponseMode(VideoMessageType.OFFSCREEN_BEGIN_RECORDING)).toBe(
    'deferred-ack'
  );
});

it('routes a window-only tab start without a viewport frame gate', async () => {
  const message = {
    capabilityToken: 'capability-1',
    captureMode: CaptureMode.TAB,
    generation: 1,
    recordingId: 'recording-1',
    settings: DEFAULT_VIDEO_SETTINGS,
    streamId: 'stream-1',
    streamInstanceId: 'instance-1',
    surface: { height: 720, presetId: 'window-hd', target: 'window' as const, width: 1280 },
    tabId: 7,
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
  };
  await handleOffscreenRuntimeMessage(message);
  expect(mocks.start).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    generation: 1,
    recordingId: 'recording-1',
    settings: DEFAULT_VIDEO_SETTINGS,
    streamId: 'stream-1',
    streamInstanceId: 'instance-1',
    surface: { height: 720, presetId: 'window-hd', target: 'window', width: 1280 },
    tabId: 7,
  });
});

it('routes a TAB recording start without precomputed Region Capture geometry', async () => {
  const message = {
    capabilityToken: 'capability-1',
    captureMode: CaptureMode.TAB,
    generation: 1,
    recordingId: 'recording-1',
    settings: DEFAULT_VIDEO_SETTINGS,
    streamId: 'stream-1',
    streamInstanceId: 'instance-1',
    tabId: 7,
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    viewport: { devicePixelRatio: 1, height: 899, scrollX: 0, scrollY: 0, width: 1440 },
  };
  await handleOffscreenRuntimeMessage(message);
  expect(mocks.start).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    generation: 1,
    recordingId: 'recording-1',
    settings: DEFAULT_VIDEO_SETTINGS,
    streamId: 'stream-1',
    streamInstanceId: 'instance-1',
    tabId: 7,
    viewport: { devicePixelRatio: 1, height: 899, scrollX: 0, scrollY: 0, width: 1440 },
  });
});

it('routes camera and desktop utility commands through the offscreen owner', async () => {
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      deviceId: 'camera-2',
      peerId: 'peer-1',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH,
    })
  ).resolves.toBeUndefined();
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      peerId: 'peer-1',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_CAMERA_CLOSE,
    })
  ).resolves.toBeUndefined();
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      deviceKind: 'videoinput',
      type: VideoMessageType.OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES,
    })
  ).resolves.toEqual({
    mediaDevices: [{ deviceId: 'camera-1', kind: 'videoinput', label: 'Camera 1' }],
  });
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      dataUrl: 'data:image/png;base64,frame',
      requestId: 'frame-1',
      type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
    })
  ).resolves.toBe('copied');
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      requestId: 'frame-1',
      type: MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
    })
  ).resolves.toEqual({ reference: { requestId: 'frame-1' } });
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      requestId: 'frame-1',
      type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
    })
  ).resolves.toBeUndefined();
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      imageFormat: 'png',
      imageQuality: 1,
      requestId: 'frame-1',
      streamId: 'stream-1',
      type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
    })
  ).resolves.toEqual({ dataUrl: 'data:image/png;base64,frame' });
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      type: VideoMessageType.DISPOSE_DESKTOP_MEDIA,
    })
  ).resolves.toBeUndefined();

  expect(mocks.switchCamera).toHaveBeenCalledWith('peer-1', 'camera-2');
  expect(mocks.closeCamera).toHaveBeenCalledWith('peer-1');
  expect(mocks.listMediaDevices).toHaveBeenCalledWith('videoinput');
  expect(mocks.setClipboard).toHaveBeenCalledWith('data:image/png;base64,frame');
  expect(mocks.reserveDesktopFrame).toHaveBeenCalledWith('frame-1');
  expect(mocks.cancelDesktopFrame).toHaveBeenCalledWith('frame-1');
  expect(mocks.captureDesktopFrame).toHaveBeenCalledWith({
    capabilityToken: 'capability-1',
    imageFormat: 'png',
    imageQuality: 1,
    requestId: 'frame-1',
    streamId: 'stream-1',
    type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
  });
  expect(mocks.disposeDesktopMedia).toHaveBeenCalledOnce();
});

it('routes frame raster, settings update, and project export commands', async () => {
  const rasterReference = { inputSha256: 'sha256-1', jobId: 'job-1', revision: 1 };
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      reference: rasterReference,
      type: MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
    })
  ).resolves.toBe('applied');
  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      generation: 1,
      recordingId: 'recording-1',
      settings: DEFAULT_VIDEO_SETTINGS,
      streamInstanceId: 'instance-1',
      type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
    })
  ).resolves.toBeUndefined();
  const sendResponse = vi.fn();
  await expect(
    handleOffscreenRuntimeMessage(
      {
        capabilityToken: 'capability-1',
        settings: createExportSettings(),
        type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
      },
      sendResponse
    )
  ).resolves.toBeUndefined();

  expect(mocks.cleanupRasterJobs).toHaveBeenCalledOnce();
  expect(mocks.acquireRasterInput).toHaveBeenCalledWith(rasterReference);
  expect(mocks.completeRasterJob).toHaveBeenCalledWith(rasterReference, expect.any(Blob), {
    height: 10,
    width: 20,
  });
  expect(mocks.update).toHaveBeenCalledWith(
    { generation: 1, recordingId: 'recording-1', streamInstanceId: 'instance-1' },
    DEFAULT_VIDEO_SETTINGS
  );
  expect(mocks.handleProjectExport).toHaveBeenCalledWith(
    {
      capabilityToken: 'capability-1',
      settings: createExportSettings(),
      type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
    },
    sendResponse
  );
});

it('cleans a failed frame raster job before surfacing the raster failure', async () => {
  mocks.rasterize.mockRejectedValueOnce(new Error('raster failed'));

  await expect(
    handleOffscreenRuntimeMessage({
      capabilityToken: 'capability-1',
      reference: { inputSha256: 'sha256-1', jobId: 'job-1', revision: 1 },
      type: MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
    })
  ).rejects.toThrow('raster failed');

  expect(mocks.deleteRasterJob).toHaveBeenCalledWith('job-1');
});

it('opens recording only after the correlated begin authority is accepted', async () => {
  const message = {
    capabilityToken: 'capability-1',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'instance-1',
    type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING,
  } as const;
  await handleOffscreenRuntimeMessage(message);
  expect(mocks.assertBegin).toHaveBeenCalledWith(message);
  expect(mocks.allowBegin).toHaveBeenCalledWith(message);

  mocks.assertBegin.mockImplementationOnce(() => {
    throw new Error('stale binding');
  });
  await expect(handleOffscreenRuntimeMessage(message)).rejects.toThrow('stale binding');
});
