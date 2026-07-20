import { beforeEach, expect, it, vi } from 'vitest';

const {
  getActiveMultiSourceRecordingIdMock,
  hasActiveMultiSourceRecordingMock,
  pauseMultiSourceRecordingMock,
  resumeMultiSourceRecordingMock,
  sendRuntimeMessageMock,
  stopMultiSourceRecordingMock,
} = vi.hoisted(() => ({
  getActiveMultiSourceRecordingIdMock: vi.fn(),
  hasActiveMultiSourceRecordingMock: vi.fn(),
  pauseMultiSourceRecordingMock: vi.fn(),
  resumeMultiSourceRecordingMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  stopMultiSourceRecordingMock: vi.fn(),
}));

vi.mock('./multi-source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./multi-source')>();
  return {
    ...actual,
    getActiveMultiSourceRecordingId: getActiveMultiSourceRecordingIdMock,
    hasActiveMultiSourceRecording: hasActiveMultiSourceRecordingMock,
    pauseMultiSourceRecording: pauseMultiSourceRecordingMock,
    resumeMultiSourceRecording: resumeMultiSourceRecordingMock,
    stopMultiSourceRecording: stopMultiSourceRecordingMock,
  };
});

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/runtime-messaging/index')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

import { pauseRecording, resumeRecording, stopRecording } from './controller';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMultiSourceRecordingIdMock.mockReturnValue('multi-1');
  hasActiveMultiSourceRecordingMock.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  stopMultiSourceRecordingMock.mockResolvedValue(undefined);
});

it('delegates stop requests to the active multi-source session', async () => {
  await expect(stopRecording(true)).resolves.toBeUndefined();

  expect(stopMultiSourceRecordingMock).toHaveBeenCalledWith(true);
});

it('routes pause and resume controls to active multi-source recorders', () => {
  pauseRecording();
  resumeRecording();

  expect(pauseMultiSourceRecordingMock).toHaveBeenCalledOnce();
  expect(resumeMultiSourceRecordingMock).toHaveBeenCalledOnce();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_PAUSED,
    recordingId: 'multi-1',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_RESUMED,
    recordingId: 'multi-1',
  });
});
