import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowBegin: vi.fn(),
  assertBegin: vi.fn(),
  cancelBegin: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
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
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: vi.fn(),
}));

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  handleOffscreenRuntimeMessage,
  resolveOffscreenErrorPhase,
  resolveOffscreenRuntimeResponseMode,
} from './routing';

beforeEach(() => {
  vi.clearAllMocks();
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
